import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { confirmPrompt, warn, error } from '../ui.js';
import type { ToolDefinition } from './registry.js';

const execAsync = promisify(exec);

const BLOCKED_PATTERNS = [
  'rm -rf /',
  'format c:',
  'shutdown',
  'del /f /s',
  ':(){ :|:&};:',
];

function isBlocked(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return BLOCKED_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

const RunShellParams = z.object({
  command: z.string().describe('The shell command to execute'),
});

export const runShellTool: ToolDefinition = {
  name: 'run_shell',
  description:
    'Execute a shell command. Blocked patterns (rm -rf /, format, shutdown) are forbidden. Requires user confirmation.',
  parameters: RunShellParams,
  async execute(args) {
    const { command } = RunShellParams.parse(args);

    if (isBlocked(command)) {
      error(`Blocked dangerous command: ${command}`);
      return `ERROR: Command blocked for safety: ${command}`;
    }

    warn(`Command: ${command}`);
    const confirmed = await confirmPrompt('Run this command?');
    if (!confirmed) return 'Command cancelled by user.';

    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      return (stdout + stderr).trim() || '(no output)';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `ERROR: ${msg}`;
    }
  },
};
