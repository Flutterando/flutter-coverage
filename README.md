# Flutter Coverage

This extension adds a tree view to the test view container. It shows the coverage per file/folder.

## Features

![Demo](https://raw.githubusercontent.com/tenninebt/vscode-koverage/master/Capture.gif)

## Extension Settings

This extension contributes the following settings:

* `flutter-coverage.coverageFileNames`: coverage file names to look for, default: ["lcov.info", "cov.xml", "coverage.xml","jacoco.xml"]
* `flutter-coverage.coverageFilePaths`: coverage paths where coverage files are located, default: ["coverage"]
* `flutter-coverage.lowCoverageThreshold`: Percentage under which, the coverage is considered too low (Renders as Error icon)
* `flutter-coverage.sufficientCoverageThreshold`: Percentage above which, the coverage is considered sufficient (Renders as Success icon)
=> lowCoverageThreshold < level < sufficientCoverageThreshold is rendered as Warn icon

## Licencing

The coverage files parsing is a mainly from https://github.com/ryanluker/vscode-coverage-gutters by ryanluker. Thanks to him for the amazing extension he built and the very useful code that helped me build this extensions. Until proper licencing is added to the copied code, this note shall remain. The files concerned by this note (Copied source with modifications or using snippets) : 
- coverage-file.ts
- coverage-parser.ts
- data-provider.ts 
- files-loader.ts

FORK for https://github.com/tenninebt/vscode-koverage
