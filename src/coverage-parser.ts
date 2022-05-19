import { parseContent as parseContentClover } from "@cvrg-report/clover-json";
import * as vscodeLogging from '@vscode-logging/logger';
import { parseContent as parseContentCobertura } from "cobertura-parse";
import { parseContent as parseContentJacoco } from "jacoco-parse";
import { Section, source } from "lcov-parse";
import * as iopath from 'path';
import * as vscode from 'vscode';
import { CoverageFile, CoverageType } from "./coverage-file";
import { WorkspaceFolderCoverage, WorkspaceFolderCoverageFiles } from "./workspace-folder-coverage-file";


export class CoverageParser {

    constructor(private readonly logger: vscodeLogging.IVSCodeExtLogger) {
    }

    /**
     * Extracts coverage sections of type xml and lcov
     * @param workspaceFolders array of coverage files in string format
     */
    public async filesToSections(workspaceFolders: Set<WorkspaceFolderCoverageFiles>): Promise<Set<WorkspaceFolderCoverage>> {
        let workspaceCoverage = new Set<WorkspaceFolderCoverage>();

        for (const folder of workspaceFolders) {

            let workspaceFolderCoverage = new Map<string, Section>();

            for (const file of folder.coverageFiles) {

                // file is an array
                let coverage: Map<string, Section> = new Map<string, Section>();

                // get coverage file type
                const coverageFile = new CoverageFile(file.content);
                switch (coverageFile.type) {
                    case CoverageType.CLOVER:
                        coverage = await this.xmlExtractClover(folder.workspaceFolder, file.path, file.content);
                        break;
                    case CoverageType.JACOCO:
                        coverage = await this.xmlExtractJacoco(folder.workspaceFolder, file.path, file.content);
                        break;
                    case CoverageType.COBERTURA:
                        coverage = await this.xmlExtractCobertura(folder.workspaceFolder, file.path, file.content);
                        break;
                    case CoverageType.LCOV:
                        coverage = await this.lcovExtract(folder.workspaceFolder, file.path, file.content);
                        break;
                    default:
                        break;
                }
                // add new coverage map to existing coverages generated so far
                workspaceFolderCoverage = new Map([...workspaceFolderCoverage, ...coverage]);
            }

            workspaceCoverage.add(new WorkspaceFolderCoverage(folder.workspaceFolder, workspaceFolderCoverage));
        }

        return workspaceCoverage;
    }

    private recomputeStats(data: any[] ) {
        data.forEach((section) => {
            if(!section.lines.hit || !section.lines.found){
                section.lines.hit = section.lines.details.reduce((a, b) => a + (b.hit > 0 ? 1 : 0), 0);
                section.lines.found = section.lines.details.length;
            }
        });
    }

    private async convertSectionsToMap(workspaceFolder: vscode.WorkspaceFolder, filename: string, data: Section[]): Promise<Map<string, Section>> {
        this.recomputeStats(data);

        const sections = new Map<string, Section>();
        const addToSectionsMap = async (section: { title: string; file: string; }) => {
            const intermediatePath = this.stripPath(filename);
            let filePath = section.file;
            if (!!intermediatePath) {
                filePath = iopath.join(intermediatePath, filePath);
            }
            if(iopath.isAbsolute(section.file) || filePath.includes(workspaceFolder.uri.fsPath)){
                //Convert to a path relative to the workspace root
                filePath = filePath.replace(workspaceFolder.uri.fsPath, "");
            }
            
            sections.set(filePath, section);
        };

        // convert the array of sections into an unique map
        const addPromises = data.map(addToSectionsMap);
        await Promise.all(addPromises);
        return sections;
    }


    private xmlExtractCobertura(workspaceFolder: vscode.WorkspaceFolder, filename: string, xmlFile: string) {
        return new Promise<Map<string, Section>>((resolve, reject) => {
            const checkError = (err: Error) => {
                if (err) {
                    err.message = `filename: ${filename} ${err.message}`;
                    this.handleError("cobertura-parse", err);
                    return resolve(new Map<string, Section>());
                }
            };

            try {
                parseContentCobertura(xmlFile, async (err: any, data: any[]) => {
                    checkError(err);
                    const sections = await this.convertSectionsToMap(workspaceFolder, filename, data);
                    return resolve(sections);
                }, true);
            } catch (error) {
                checkError(error);
            }
        });
    }

    private xmlExtractJacoco(workspaceFolder: vscode.WorkspaceFolder, filename: string, xmlFile: string) {
        return new Promise<Map<string, Section>>((resolve, reject) => {
            const checkError = (err: Error) => {
                if (err) {
                    err.message = `filename: ${filename} ${err.message}`;
                    this.handleError("jacoco-parse", err);
                    return resolve(new Map<string, Section>());
                }
            };

            try {
                parseContentJacoco(xmlFile, async (err: any, data: any[]) => {
                    checkError(err);
                    const sections = await this.convertSectionsToMap(workspaceFolder, filename, data);
                    return resolve(sections);
                });
            } catch (error) {
                checkError(error);
            }
        });
    }

    private async xmlExtractClover(workspaceFolder: vscode.WorkspaceFolder, filename: string, xmlFile: string) {
        try {
            const data = await parseContentClover(xmlFile);
            const sections = await this.convertSectionsToMap(workspaceFolder, filename, data);
            return sections;
        } catch (error) {
            error.message = `filename: ${filename} ${error.message}`;
            this.handleError("clover-parse", error);
            return new Map<string, Section>();
        }
    }

    private lcovExtract(workspaceFolder: vscode.WorkspaceFolder, filename: string, lcovFile: string) {
        return new Promise<Map<string, Section>>((resolve, reject) => {
            const checkError = (err: Error) => {
                if (err) {
                    err.message = `filename: ${filename} ${err.message}`;
                    this.handleError("lcov-parse", err);
                    return resolve(new Map<string, Section>());
                }
            };

            try {
                source(lcovFile, async (err: Error, data: any[]) => {
                    checkError(err);
                    const sections = await this.convertSectionsToMap(workspaceFolder, filename, data);
                    return resolve(sections);
                });
            } catch (error) {
                checkError(error);
            }
        });
    }

    private handleError(system: string, error: Error) {
        const message = error.message ? error.message : error;
        const stackTrace = error.stack;
        this.logger.error(
            `[${Date.now()}][coverageparser][${system}]: Error: ${message}\n${stackTrace}`,
        );
    }

    // Removes the coverage dir and file from coverage path
    private stripPath(filename: String) {
        return (filename || '').split('/').slice(0, -2).join('/');
    }
}
