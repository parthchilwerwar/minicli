import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { confirmPrompt, warn, error } from '../ui.js';
import { sendToTelegram } from '../agents/base.js';
import type { ToolDefinition } from './registry.js';

const execAsync = promisify(exec);

// ─── Safety ──────────────────────────────────────────────────────────────────
//
// The previous version did substring matching against five literal patterns
// (e.g. "rm -rf /"), which any whitespace tweak bypassed. We now:
//   1. Normalize the command (collapse whitespace, lowercase).
//   2. Match against a regex list that catches common destructive patterns.
//   3. Default-deny anything that obviously rewrites init / disk / boot.
//
// This is still a denylist, so it is not a substitute for not exposing
// run_shell to untrusted input. It just closes the trivially-injectable holes.

const DANGEROUS_PATTERNS: RegExp[] = [
  // Filesystem wipes
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(-[a-z]+\s+)*\/(\s|$)/,   // rm -rf /
  /\brm\s+--no-preserve-root\b/,
  /\bfind\s+\/[^\s]*\s+[^|]*-delete\b/,
  /\bfind\s+\/[^\s]*\s+[^|]*-exec\s+rm\b/,
  // Disk / partition
  /\bmkfs(\.|\s)/,
  /\bdd\s+[^|]*of=\/dev\//,
  />\s*\/dev\/(sd|nvme|hd|xvd|vd)/,
  /\bshred\s+[^|]*\/dev\//,
  // System control
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\binit\s+[06]\b/,
  /\btelinit\s+[06]\b/,
  /\bsystemctl\s+(poweroff|halt|reboot|isolate)\b/,
  // Permission destruction at root
  /\bchmod\s+(-r\s+)?0+\s+\//,
  /\bchown\s+(-r\s+)?[^\s]+\s+\/(\s|$)/,
  // Fork bomb
  /:\s*\(\s*\)\s*\{[^}]*\|/,
  // Direct overwrite of critical files
  />\s*\/etc\/(passwd|shadow|sudoers|hosts|ssh\/)/,
  />\s*~?\/.ssh\//,
  /\bcurl\s+[^|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/,
  /\bwget\s+[^|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/,
  // Windows leftovers \u2014 harmless on Linux but keep for parity
  /\bformat\s+[a-z]:\s*\/q/,
];

function normalize(cmd: string): string {
  return cmd.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isBlocked(cmd: string): string | null {
  const norm = normalize(cmd);
  for (const pat of DANGEROUS_PATTERNS) {
    if (pat.test(norm)) return pat.source;
  }
  return null;
}

// ─── Confirmation strategy ───────────────────────────────────────────────────
//
// inquirer requires a TTY. When the daemon runs under PM2 / systemd / via
// Telegram, stdin is not a TTY and inquirer hangs forever, blocking the
// HTTP request thread. We pick the right strategy at call time:
//
//   * interactive TTY  -> inquirer confirm prompt
//   * daemon (no TTY)  -> log to Telegram + Node console and run.
//                         AUTO_RUN_SHELL=false makes the daemon refuse
//                         instead of running automatically.

function isTty(): boolean {
  return Boolean(process.stdin.isTTY);
}

function autoRunAllowed(): boolean {
  // Default: daemon may run non-blocked shell commands without confirmation.
  // Set AUTO_RUN_SHELL=false in .env to require an out-of-band confirmation
  // (currently means: command is refused; ask the user to run it manually).
  return (process.env['AUTO_RUN_SHELL'] ?? 'true').toLowerCase() !== 'false';
}

const RunShellParams = z.object({
  command: z.string().describe('The shell command to execute'),
});

export const runShellTool: ToolDefinition = {
  name: 'run_shell',
  description:
    'Execute a shell command. Destructive patterns (rm -rf /, mkfs, dd to disks, shutdown, fork bombs, curl|sh, etc.) are blocked. In interactive mode the user is asked to confirm; in daemon mode AUTO_RUN_SHELL controls behaviour.',
  parameters: RunShellParams,
  async execute(args) {
    const { command } = RunShellParams.parse(args);

    const blocked = isBlocked(command);
    if (blocked) {
      error(`Blocked dangerous command: ${command}`);
      void sendToTelegram(`\u26a0\ufe0f Blocked shell command (matched /${blocked}/):\n\`${command}\``).catch(() => {});
      return `ERROR: Command blocked by safety filter (/${blocked}/): ${command}`;
    }

    warn(`Command: ${command}`);

    if (isTty()) {
      const confirmed = await confirmPrompt('Run this command?');
      if (!confirmed) return 'Command cancelled by user.';
    } else if (!autoRunAllowed()) {
      // Headless and auto-run disabled \u2014 surface it to the user out of band.
      void sendToTelegram(`\ud83d\udd12 Shell command requested but AUTO_RUN_SHELL=false:\n\`${command}\``).catch(() => {});
      return `ERROR: Refusing to run in daemon mode (AUTO_RUN_SHELL=false): ${command}`;
    } else {
      void sendToTelegram(`\u2699\ufe0f Running shell command:\n\`${command}\``).catch(() => {});
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return (stdout + stderr).trim() || '(no output)';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `ERROR: ${msg}`;
    }
  },
};
