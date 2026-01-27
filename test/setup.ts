/**
 * Test setup - provides vscode mock for unit tests
 */

// Mock vscode module before any other imports
import Module from 'module';

const vscodeMock = {
  window: {
    showInformationMessage: () => Promise.resolve(),
    showErrorMessage: () => Promise.resolve(),
    showWarningMessage: () => Promise.resolve(),
    createOutputChannel: () => ({
      appendLine: () => {},
      append: () => {},
      show: () => {},
      clear: () => {},
      dispose: () => {},
    }),
    withProgress: (_options: unknown, task: Function) => task({
      report: () => {},
    }),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
      update: () => Promise.resolve(),
    }),
    workspaceFolders: [],
    findFiles: () => Promise.resolve([]),
    fs: {
      readFile: () => Promise.resolve(Buffer.from('')),
      writeFile: () => Promise.resolve(),
    },
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, path }),
    parse: (uri: string) => ({ fsPath: uri, path: uri }),
  },
  Range: class Range {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
  },
  Position: class Position {
    constructor(public line: number, public character: number) {}
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  languages: {
    createDiagnosticCollection: () => ({
      set: () => {},
      clear: () => {},
      delete: () => {},
      dispose: () => {},
    }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
  },
  extensions: {
    getExtension: () => undefined,
  },
  EventEmitter: class EventEmitter {
    event = () => ({ dispose: () => {} });
    fire = () => {};
    dispose = () => {};
  },
  TreeItem: class TreeItem {
    constructor(public label: string, public collapsibleState?: number) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ProgressLocation: {
    Notification: 15,
    SourceControl: 1,
    Window: 10,
  },
  ExtensionContext: class ExtensionContext {},
};

// Install the mock using Node's module system
const originalRequire = Module.prototype.require;

// @ts-ignore - overriding require for mocking
Module.prototype.require = function (this: NodeModule, id: string) {
  if (id === 'vscode') {
    return vscodeMock;
  }
  return originalRequire.apply(this, [id] as unknown as [string]);
};
