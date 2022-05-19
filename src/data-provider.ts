import * as vscodeLogging from '@vscode-logging/logger';
import * as iopath from 'path';
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import { ConfigStore } from './config-store';
import { CoverageParser } from './coverage-parser';
import { FilesLoader } from './files-loader';
import { WorkspaceFolderCoverage } from './workspace-folder-coverage-file';

export class FileCoverageDataProvider implements vscode.TreeDataProvider<CoverageNode>, vscode.Disposable {

    private coverageWatcher: vscode.FileSystemWatcher;

    private readonly rootNodeKey: string = '';

    constructor(
        private readonly configStore: ConfigStore,
        private readonly coverageParser: CoverageParser,
        private readonly filesLoader: FilesLoader,
        private readonly logger: vscodeLogging.IVSCodeExtLogger) {

        if (configStore === null || configStore === undefined) {
            throw new Error('configStore must be defined');
        }

        if (coverageParser === null || coverageParser === undefined) {
            throw new Error('coverageParser must be defined');
        }

        if (filesLoader === null || filesLoader === undefined) {
            throw new Error('filesLoader must be defined');
        }
        this.listenToFileSystem();
        this.listenToConfigChanges();
    }

    listenToConfigChanges() {
        this.configStore.subscribe(_ => this.refresh('<ConfigChanged>'));
    }

    dispose() {
        this.coverageWatcher?.dispose();
    }

    private listenToFileSystem(): void {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('No file coverage in empty workspace');
            return;
        }
        for (let folder of vscode.workspace.workspaceFolders) {
            const searchPattern = iopath.join(folder.uri.fsPath, `**${iopath.sep}{${this.configStore.current.coverageFilePaths}${iopath.sep}**}`);
            this.logger.debug(`createFileSystemWatcher(Pattern = ${searchPattern})`);
            this.coverageWatcher = vscode.workspace.createFileSystemWatcher(searchPattern);
            this.coverageWatcher.onDidChange(() => this.refresh('<CoverageChanged>'));
            this.coverageWatcher.onDidCreate(() => this.refresh('<CoverageCreated>'));
            this.coverageWatcher.onDidDelete(() => this.refresh('<CoverageDeleted>'));
        }
    }

    getTreeItem(element: CoverageNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CoverageNode): Thenable<CoverageNode[]> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('No file coverage in empty workspace');
            return Promise.resolve([]);
        }
        if (!element) {
            return this
                .getIndexedCoverageData()
                .then(indexedCoverageData => {
                    return indexedCoverageData.get(this.rootNodeKey)?.children;
                });
        } else {
            return Promise.resolve(element.children.sort((a, b) => a.path.localeCompare(b.path)));
        }
    }

    private async getRawCoverageData(): Promise<Set<WorkspaceFolderCoverage>> {
        let coverageData = await this.filesLoader
            .loadCoverageFiles()
            .then(async files => await this.coverageParser.filesToSections(files));
        return coverageData;
    }

    private async getIndexedCoverageData(): Promise<Map<string, CoverageNode>> {

        const coverageLevelThresholds = new CoverageLevelThresholds(this.configStore.current.sufficientCoverageThreshold, this.configStore.current.lowCoverageThreshold);

        let coverageData = await this.getRawCoverageData();

        let nodesMap: Map<string, CoverageNode> = new Map<string, CoverageNode>();

        const rootNode = new FolderCoverageNode(this.rootNodeKey, this.rootNodeKey, [], coverageLevelThresholds);
        nodesMap.set(this.rootNodeKey, rootNode);

        for (const workspaceFolderCoverage of coverageData) {

            const workspaceFolderNode = new FolderCoverageNode(workspaceFolderCoverage.workspaceFolder.uri.fsPath, workspaceFolderCoverage.workspaceFolder.name, [],
                coverageLevelThresholds);
            rootNode.children.push(workspaceFolderNode);
            nodesMap.set(workspaceFolderNode.label, workspaceFolderNode);

            for (const [codeFilePath, coverageData] of workspaceFolderCoverage.coverage) {

                let pathSteps = codeFilePath.split(iopath.sep);
                let parentNodePath = workspaceFolderNode.label; //Path in the visual tree
                let parentRelativeFilePath = ''; //Physical path relative to the workspace folder

                for (let index = 0; index < pathSteps.length; index++) {
                    const step = pathSteps[index];
                    let relativeNodePath = iopath.join(parentNodePath, step);
                    let relativeFilePath = iopath.join(parentRelativeFilePath, step);
                    const absoluteFilePath = iopath.join(workspaceFolderCoverage.workspaceFolder.uri.fsPath, relativeFilePath);

                    const parentNode = nodesMap.get(parentNodePath);
                    if (parentNode instanceof FolderCoverageNode) {
                        if (!nodesMap.has(relativeNodePath)) {
                            let node: CoverageNode;
                            if (index === pathSteps.length - 1) { //IsLeaf node
                                node = new FileCoverageNode(absoluteFilePath, step, coverageLevelThresholds, coverageData.lines.found, coverageData.lines.hit);
                            } else {
                                node = new FolderCoverageNode(absoluteFilePath, step, [], coverageLevelThresholds);
                            }
                            parentNode.children.push(node);
                            nodesMap.set(relativeNodePath, node);
                        }
                    } else {
                        //Weird case !
                        this.logger.warn(`Could not find a parent node with parentPath = ${parentNodePath}`);
                    }

                    parentNodePath = relativeNodePath;
                    parentRelativeFilePath = relativeFilePath;
                }
            }
        };
        return nodesMap;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<CoverageNode | undefined> = new vscode.EventEmitter<CoverageNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<CoverageNode | undefined> = this._onDidChangeTreeData.event;

    refresh(reason: string): void {
        this.logger.debug(`Refreshing due to ${reason}...`);
        this._onDidChangeTreeData.fire();
    }

    runTestCoverage(): void {
        if (vscode.workspace.workspaceFolders !== undefined) {
            let rootProjectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (fs.existsSync(rootProjectPath + '/test')) {

                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Running Test coverage...",
                    cancellable: true
                }, (_, token) => {
                    token.onCancellationRequested(() => {
                        console.log("User canceled the long running operation");
                    });

                    const result = new Promise<String>((resolve, reject) => {
                        cp.exec(`cd ${rootProjectPath} && flutter test --coverage`, (err, out) => {
                            if (err) {
                                return reject(err);
                            }
                            return resolve(out);
                        });
                    });

                    return result;
                });
            } else {
                this.logger.info('Directory not found');
            }
        }
    }

    clearCoverage(): void {
        if (vscode.workspace.workspaceFolders !== undefined) {
            let rootProjectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            let coveragePath = iopath.join(rootProjectPath, `${this.configStore.current.coverageFilePaths}`);
            vscode.workspace.fs.delete(vscode.Uri.parse(coveragePath), { recursive: true });
            this.logger.info('Cleaning coverage workspace with success');
        }
    }
}

enum CoverageLevel {
    Low = 'low',
    Medium = 'medium',
    High = 'high'
}

class CoverageLevelThresholds {
    constructor(
        public readonly sufficientCoverageThreshold: number,
        public readonly lowCoverageThreshold: number
    ) {
    }

}
export abstract class CoverageNode extends vscode.TreeItem {

    constructor(
        public readonly path: string,
        public readonly label: string,
        public readonly children: CoverageNode[],
        private readonly coverageLevelThresholds: CoverageLevelThresholds,
        collapsibleState: vscode.TreeItemCollapsibleState | undefined
    ) {
        super(label, collapsibleState);
    }

    private getCoveragePercent(): number {
        return this.totalLinesCount === 0 ? 100 : this.coveredLinesCount / this.totalLinesCount * 100;
    }

    abstract get totalLinesCount(): number;

    abstract get coveredLinesCount(): number;

    //@ts-ignore Children are settable, thus this value can't be set in the constructor, maybe it should be updated whenever the children are updated
    get tooltip(): string {
        return `${this.label}: ${this.formatCoverage()}`;
    }

    //@ts-ignore Children are settable, thus this value can't be set in the constructor, maybe it should be updated whenever the children are updated
    get description(): string {
        return this.formatCoverage();
    }

    private formatCoverage(): string {
        return +this.getCoveragePercent().toFixed(1) + '%';
    }

    //@ts-ignore Children are settable, thus this value can't be set in the constructor, maybe it should be updated whenever the children are updated
    get resourceUri(): vscode.Uri {
        return vscode.Uri.file(this.path);
    }

    private getCoverageLevel(): CoverageLevel {
        const coverageLevel =
            this.getCoveragePercent() >= this.coverageLevelThresholds.sufficientCoverageThreshold ? CoverageLevel.High :
                this.getCoveragePercent() >= this.coverageLevelThresholds.lowCoverageThreshold ? CoverageLevel.Medium : CoverageLevel.Low;
        return coverageLevel;
    }

    //@ts-ignore Children are settable, thus this value can't be set in the constructor, maybe it should be updated whenever the children are updated
    get iconPath() {
        const light = iopath.join(__dirname, '..', 'resources', 'light', `${this.getCoverageLevel().toString()}.svg`);
        const dark = iopath.join(__dirname, '..', 'resources', 'dark', `${this.getCoverageLevel().toString()}.svg`);
        return {
            light: light,
            dark: dark
        };
    }
}

class FolderCoverageNode extends CoverageNode {

    constructor(
        path: string,
        label: string,
        children: CoverageNode[] = [],
        coverageLevelThresholds: CoverageLevelThresholds,
    ) {
        super(path, label, children, coverageLevelThresholds, vscode.TreeItemCollapsibleState.Collapsed);
    }

    get totalLinesCount(): number {
        var sum = 0;
        this.children.forEach(n => sum += n.totalLinesCount);
        return sum;
    }

    get coveredLinesCount(): number {
        var sum = 0;
        this.children.forEach(n => sum += n.coveredLinesCount);
        return sum;
    }
}

class FileCoverageNode extends CoverageNode {

    constructor(
        path: string,
        label: string,
        coverageLevelThresholds: CoverageLevelThresholds,
        public readonly totalLinesCount: number,
        public readonly coveredLinesCount: number,
    ) {
        super(path, label, [], coverageLevelThresholds, vscode.TreeItemCollapsibleState.None);
        this.contextValue = FileCoverageNode.name;
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [vscode.Uri.file(this.path)],
        };
    }
}
