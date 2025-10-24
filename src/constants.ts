const SYMBOLS: Symbols = {
  BRANCH: '├── ',
  LAST_BRANCH: '└── ',
  INDENT: '│   ',
  INDENT_EMPTY: '    ',
  EXPANDED: '[-]',
  COLLAPSED: '[+]',
  SELECTED: '[✓]', // White checkmark (fully selected)
  PARTIAL: '[▪]', // Gray checkmark (partially selected)
  UNSELECTED: '[ ]',
};

export const OutputSymbols = {
  OBOVE_PATH: '==========',
  BELOW_PATH: '==========',
  BELOW_CONTENT: '',
};

export const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  '.vscode',
];
