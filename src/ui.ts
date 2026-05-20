import chalk from 'chalk';
import inquirer from 'inquirer';

const LIME   = chalk.hex('#b5f300');
const DIM    = chalk.gray;
const WHITE  = chalk.white;
const RED    = chalk.red;
const YELLOW = chalk.yellow;

// ─── Spinner ──────────────────────────────────────────────────────────────────

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class Spinner {
  private frame   = 0;
  private timer:  ReturnType<typeof setInterval> | null = null;
  private label   = '';
  private active  = false;

  start(label: string): void {
    if (this.active) this.stop();
    this.label  = label;
    this.active = true;
    this.frame  = 0;
    process.stdout.write('\n');
    this.timer = setInterval(() => {
      const f = FRAMES[this.frame % FRAMES.length] ?? '·';
      process.stdout.write(`\r  ${DIM(f)}  ${DIM(this.label)}`);
      this.frame++;
    }, 80);
  }

  update(label: string): void {
    this.label = label;
  }

  stop(finalLine?: string): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.active = false;
    // Clear the spinner line
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    if (finalLine) process.stdout.write('  ' + DIM(finalLine) + '\n');
  }
}

// Singleton spinner — only one tool runs at a time
let _spinner: Spinner | null = null;

function getSpinner(): Spinner {
  if (!_spinner) _spinner = new Spinner();
  return _spinner;
}

// ─── Banner ───────────────────────────────────────────────────────────────────

export function printBanner(): void {
  const logo = [
    '  ███╗   ███╗██╗███╗   ██╗██╗ ██████╗██╗     ██╗',
    '  ████╗ ████║██║████╗  ██║██║██╔════╝██║     ██║',
    '  ██╔████╔██║██║██╔██╗ ██║██║██║     ██║     ██║',
    '  ██║╚██╔╝██║██║██║╚██╗██║██║██║     ██║     ██║',
    '  ██║ ╚═╝ ██║██║██║ ╚████║██║╚██████╗███████╗██║',
    '  ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚══════╝╚═╝',
  ];

  console.log('');
  for (const line of logo) console.log(LIME(line));
  console.log('');
  console.log(
    '  ' + DIM('v1') +
    '  ' + DIM('·') +
    '  ' + DIM('personal AI assistant') +
    '  ' + DIM('·') +
    '  ' + DIM('conversations are private')
  );
  console.log('');
  console.log('  ' + DIM('/help for commands') + '   ' + DIM('/exit to quit'));
  console.log('');
}

// ─── Help ─────────────────────────────────────────────────────────────────────

export function printHelp(): void {
  console.log('');
  console.log('  ' + LIME('cli commands'));
  console.log('');
  const cmds: [string, string][] = [
    ['mini',                  'start interactive chat'],
    ['mini chat',             'start interactive chat'],
    ['mini ask "question"',   'one-shot answer (also: cat file | mini ask)'],
    ['mini git',              'git dashboard'],
    ['mini git log [-n N]',   'commit log table'],
    ['mini git diff',         'AI explanation of diff'],
    ['mini note "text"',      'save a note (AI auto-tags)'],
    ['mini notes',            'list notes (--tag, --search)'],
    ['mini shell "desc"',     'generate + run a shell command'],
    ['mini explain',          'explain piped input (cat file | mini explain)'],
    ['mini history',          'show recent chat turns'],
    ['mini clear',            'clear chat history'],
    ['mini daemon',           'start the background daemon (port 6274)'],
    ['mini mcp serve',        'start the MCP server'],
    ['mini routine add/list', 'manage automated background routines'],
    ['mini plan "task"',      'supervised execution plan'],
    ['mini context export',   'manage personal context pack'],
    ['mini today',            'rich daily dashboard'],
    ['mini help',             'show this message'],
  ];
  for (const [cmd, desc] of cmds) {
    console.log('  ' + LIME(cmd.padEnd(28)) + DIM(desc));
  }
  console.log('');
  console.log('  ' + LIME('in-chat commands'));
  console.log('');
  const slash: [string, string][] = [
    ['/help',    'show commands'],
    ['/notes',   'list saved notes'],
    ['/history', 'show history'],
    ['/clear',   'clear history'],
    ['/exit',    'quit'],
  ];
  for (const [cmd, desc] of slash) {
    console.log('  ' + LIME(cmd.padEnd(12)) + DIM(desc));
  }
  console.log('');
}

// ─── Log helpers ─────────────────────────────────────────────────────────────

export function success(msg: string): void {
  console.log('  ' + LIME('+') + '  ' + WHITE(msg));
}

export function error(msg: string): void {
  console.log('\n  ' + RED('error') + '  ' + WHITE(msg) + '\n');
}

export function info(msg: string): void {
  console.log('  ' + DIM(msg));
}

export function warn(msg: string): void {
  console.log('\n  ' + YELLOW('!') + '  ' + YELLOW(msg));
}

// ─── REPL prompts ─────────────────────────────────────────────────────────────

export function userPromptLabel(): string {
  return '\n  ' + LIME('>') + '  ';
}

export function aiPrefix(): void {
  process.stdout.write('\n  ' + DIM('ai') + '  ');
}

export function aiDone(): void {
  console.log('');
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export function streamPrint(chunk: string): void {
  process.stdout.write(WHITE(chunk));
}

// ─── Tool spinner ─────────────────────────────────────────────────────────────

// Label map so tool names read naturally in the spinner
const TOOL_LABELS: Record<string, string> = {
  web_search:   'searching the web',
  run_shell:    'running command',
  read_file:    'reading file',
  write_file:   'writing file',
  list_dir:     'listing directory',
  git_status:   'checking git status',
  git_log:      'reading git log',
  git_diff:     'reading git diff',
  git_stats:    'reading git stats',
  save_note:    'saving note',
  list_notes:   'loading notes',
  search_notes: 'searching notes',
  delete_note:  'deleting note',
  // GitHub
  github_list_prs:          'listing PRs',
  github_create_pr:         'creating PR',
  github_list_issues:       'listing issues',
  github_create_issue:      'creating issue',
  github_get_workflow_runs: 'checking CI runs',
  github_merge_pr:          'merging PR',
  // TickTick
  ticktick_get_today:     'fetching today\'s tasks',
  ticktick_get_all:       'listing tasks',
  ticktick_create_task:   'creating task',
  ticktick_complete_task: 'completing task',
  ticktick_get_projects:  'listing projects',
  // Calendar
  calendar_get_today:      'fetching today\'s events',
  calendar_get_week:       'fetching week events',
  calendar_create_event:   'creating event',
  calendar_find_free_slots:'finding free slots',
  // Obsidian
  obsidian_search:      'searching vault',
  obsidian_read_note:   'reading note',
  obsidian_create_note: 'creating note',
  obsidian_list_recent: 'listing recent notes',
  obsidian_append_note: 'appending to note',
  // News
  news_fetch_rss:        'fetching feed',
  news_summarise_today:  'summarising news',
  news_search_headlines: 'searching headlines',
  // Filesystem
  fs_list_dir:      'listing directory',
  fs_read_file:     'reading file',
  fs_find:          'finding files',
  fs_get_structure: 'building tree',
  vault_list:       'listing vault',
  vault_read:       'reading vault note',
  vault_search:     'searching vault',
};

export function toolStart(name: string): void {
  const label = TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
  getSpinner().start(label);
}

export function toolDone(_result: string): void {
  getSpinner().stop();
}

// ─── Confirm prompt ───────────────────────────────────────────────────────────

export async function confirmPrompt(msg: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    { type: 'confirm', name: 'confirmed', message: msg, default: false },
  ]);
  return confirmed;
}
