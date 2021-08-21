import { Section } from "lcov-parse";
import * as vscode from 'vscode';

export class WorkspaceFolderCoverageFiles {
    public readonly coverageFiles: Set<WorkspaceFolderCoverageFile> = new Set<WorkspaceFolderCoverageFile>();
    constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) { }
}

export class WorkspaceFolderCoverageFile {
    constructor(public readonly path: string, public readonly content: string) { }
}

export class WorkspaceFolderCoverage {
    constructor(public readonly workspaceFolder: vscode.WorkspaceFolder, public readonly coverage: Map<string, Section>) {}
}
