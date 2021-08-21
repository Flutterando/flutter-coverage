import * as vscodeLogging from '@vscode-logging/logger';
import * as fs from 'fs';
import { readFile } from "fs";
import * as iopath from "path";
import * as vscode from 'vscode';
import { ConfigStore } from "./config-store";
import { WorkspaceFolderCoverageFile, WorkspaceFolderCoverageFiles } from "./workspace-folder-coverage-file";

export class FilesLoader {

    constructor(private readonly configStore: ConfigStore, private readonly logger: vscodeLogging.IVSCodeExtLogger) { }


    /**
     * Takes files and converts to data strings for coverage consumption
     * @param files files that are to turned into data strings
     */
    public async loadCoverageFiles(): Promise<Set<WorkspaceFolderCoverageFiles>> {
        const fileNames = this.configStore.current.coverageFileNames;
        const filesPaths = this.configStore.current.coverageFilePaths;
        const files = await this.loadCoverageInWorkspace(filesPaths, fileNames);
        if (!files.size) { 
            this.logger.warn('Could not find a Coverage file!');
        }
        return files;
    }
    private async loadCoverageInWorkspace(filesPaths: string[], fileNames: string[]): Promise<Set<WorkspaceFolderCoverageFiles>> {
        let coverageFiles = new Map<string, WorkspaceFolderCoverageFiles>();
        if (vscode.workspace.workspaceFolders) {
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                for (const filePath of filesPaths) {
                    for (const fileName of fileNames) {

                        const coverageFileFullPath = iopath.join(workspaceFolder.uri.fsPath, filePath, fileName);

                        if (fs.existsSync(coverageFileFullPath) && fs.lstatSync(coverageFileFullPath).isFile()) {

                            if (!coverageFiles.has(workspaceFolder.uri.fsPath)){
                                coverageFiles.set(workspaceFolder.uri.fsPath, new WorkspaceFolderCoverageFiles(workspaceFolder));
                            }
                            coverageFiles.get(workspaceFolder.uri.fsPath)?.coverageFiles.add(new WorkspaceFolderCoverageFile(coverageFileFullPath, await this.load(coverageFileFullPath)));
                        }
                    }
                }
            }
        } else {
            this.logger.warn('Empty workspace');
        }

        return new Set<WorkspaceFolderCoverageFiles>(coverageFiles.values());
    }

    private load(path: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            readFile(path, (err, data) => {
                if (err) { return reject(err); }
                return resolve(data.toString());
            });
        });
    }
}
