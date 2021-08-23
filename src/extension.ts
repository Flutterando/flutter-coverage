// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FileCoverageDataProvider, CoverageNode } from './data-provider';
import { CoverageParser } from './coverage-parser';
import { FilesLoader } from './files-loader';
import { ConfigStore } from './config-store';
import * as vscodeLogging from '@vscode-logging/logger';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const outputChannel = vscode.window.createOutputChannel('FlutterCoverage');
	const logger = vscodeLogging.getExtensionLogger({
		extName: "FlutterCoverage",
		level: "debug", // See LogLevel type in @vscode-logging/types for possible logLevels
		logPath: context.logPath, // The logPath is only available from the `vscode.ExtensionContext`
		logOutputChannel: outputChannel, // OutputChannel for the logger
		sourceLocationTracking: false
	});

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	const configStore = new ConfigStore(logger);
	const fileCoverageDataProvider = new FileCoverageDataProvider(
		configStore,
		new CoverageParser(logger),
		new FilesLoader(configStore, logger),
		logger);

	let treeView = vscode.window.createTreeView('flutter-coverage', {
		treeDataProvider: fileCoverageDataProvider,
		showCollapseAll: true,
		canSelectMany: false
	});

	// --- Commands
	let runTestCoverage = vscode.commands.registerCommand('flutter-coverage.runTestCoverage', () => fileCoverageDataProvider.runTestCoverage());

	let clearCoverage = vscode.commands.registerCommand('flutter-coverage.clearCoverage', () => fileCoverageDataProvider.clearCoverage());

	let refresh = vscode.commands.registerCommand('flutter-coverage.refresh', () => fileCoverageDataProvider.refresh('<RefreshCommand>'));

	//TODO fix this command
	let openFile = vscode.commands.registerCommand('flutter-coverage.openFile', (node: CoverageNode) => {
		if (node.command && node.command.arguments) {
			vscode.commands.executeCommand(node.command.command || '', ...node.command.arguments);
		}
	});

	context.subscriptions.push(runTestCoverage);
	context.subscriptions.push(clearCoverage);
	context.subscriptions.push(refresh);
	context.subscriptions.push(openFile);
	context.subscriptions.push(treeView);
	context.subscriptions.push(outputChannel);
}

// this method is called when your extension is deactivated
export function deactivate() { }
