import * as vscode from "vscode";
import * as rx from 'rxjs';
import * as vscodeLogging from '@vscode-logging/logger';

export class ConfigStore {

    private readonly configurationKey: string = "flutter-coverage";

    private readonly _subject: rx.Subject<Config>;
    private _current: Config;
    public get current(): Config { return this._current; }

    constructor(private readonly logger: vscodeLogging.IVSCodeExtLogger) {

        this.readConfig();

        this._subject = new rx.Subject<Config>();
        // Reload the cached values if the configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(this.configurationKey)) {
                this.readConfig();
                this._subject.next(this._current);
            }
        });

    }

    private readConfig() {

        const configRoot = "flutter-coverage";
        const updatedRawConfig = vscode.workspace.getConfiguration(configRoot);
        const updatedConfig = this.convertConfig(updatedRawConfig);
        if (updatedConfig.isValid) {
            this._current = updatedConfig;
        } else {
            let rollbackConfig: Config;
            if (this._current?.isValid) {
                rollbackConfig = this._current;
            } else {
                const coverageFileNames = updatedRawConfig.inspect('coverageFileNames')?.defaultValue as string[];
                const coverageFilePaths = updatedRawConfig.inspect('coverageFilePaths')?.defaultValue as string[];
                const lowCoverageThreshold = updatedRawConfig.inspect('lowCoverageThreshold')?.defaultValue as number;
                const sufficientCoverageThreshold = updatedRawConfig.inspect('sufficientCoverageThreshold')?.defaultValue as number;
                rollbackConfig = new Config(coverageFileNames, coverageFilePaths, lowCoverageThreshold, sufficientCoverageThreshold);
            }
            this.logger.warn(`Invalid configuration : ${updatedConfig}`);
            this.logger.warn(`Last valid configuration will be used : ${rollbackConfig}`);
            updatedRawConfig.update(`coverageFileNames`, rollbackConfig.coverageFileNames);
            updatedRawConfig.update(`coverageFilePaths`, rollbackConfig.coverageFilePaths);
            updatedRawConfig.update(`lowCoverageThreshold`, rollbackConfig.lowCoverageThreshold);
            updatedRawConfig.update(`sufficientCoverageThreshold`, rollbackConfig.sufficientCoverageThreshold);
        }
    }

    private convertConfig(workspaceConfiguration: vscode.WorkspaceConfiguration): Config {
        // Basic configurations
        const coverageFileNames = workspaceConfiguration.get("coverageFileNames") as string[];
        const coverageFilePaths = workspaceConfiguration.get("coverageFilePaths") as string[];
        const lowCoverageThreshold = workspaceConfiguration.get("lowCoverageThreshold") as number;
        const sufficientCoverageThreshold = workspaceConfiguration.get("sufficientCoverageThreshold") as number;
        return new Config(coverageFileNames, coverageFilePaths, lowCoverageThreshold, sufficientCoverageThreshold);
    }

    public subscribe(next?: (value: Config) => void, error?: (error: any) => void, complete?: () => void): rx.Subscription {
        return this._subject.subscribe(next, error, complete);
    }
}

export class Config {

    public readonly isValid: boolean;

    constructor(
        public readonly coverageFileNames: string[],
        public readonly coverageFilePaths: string[],
        public readonly lowCoverageThreshold: number,
        public readonly sufficientCoverageThreshold: number
    ) {
        // Make fileNames unique
        this.coverageFileNames = [...new Set(this.coverageFileNames)];
        // Make filePaths unique
        this.coverageFilePaths = [...new Set(this.coverageFilePaths)];

        this.isValid = this.checkRules() === null;
    }

    private checkRules(): string | null {
        if (this.sufficientCoverageThreshold <= 0 || this.sufficientCoverageThreshold > 100) {
            return 'Rule: 0 < sufficientCoverageThreshold < 100';
        }
        if (this.lowCoverageThreshold < 0 || this.lowCoverageThreshold >= 99) {
            return 'Rule: 0 <= lowCoverageThreshold < 99';
        }
        if (this.sufficientCoverageThreshold < this.lowCoverageThreshold) {
            return 'sufficientCoverageThreshold > lowCoverageThreshold';
        }
        return null;
    }
}
