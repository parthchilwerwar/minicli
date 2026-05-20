import { simpleGit } from 'simple-git';
import type { DefaultLogFields, ListLogLine } from 'simple-git';
import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

const git = simpleGit(process.cwd());

type LogEntry = DefaultLogFields & ListLogLine;

const GitLogParams = z.object({
  n: z.number().default(10).describe('Number of commits to show'),
});

const EmptyParams = z.object({});

export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description: 'Get current git status: branch, staged/unstaged files, untracked count',
  parameters: EmptyParams,
  async execute() {
    try {
      const status = await git.status();
      const lines: string[] = [
        `Branch: ${status.current ?? 'unknown'}`,
        `Ahead: ${status.ahead}, Behind: ${status.behind}`,
        `Staged: ${status.staged.join(', ') || 'none'}`,
        `Modified: ${status.modified.join(', ') || 'none'}`,
        `Untracked: ${status.not_added.length} file(s)`,
      ];
      return lines.join('\n');
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  description: 'Get recent git commits',
  parameters: GitLogParams,
  async execute(args) {
    const { n } = GitLogParams.parse(args);
    try {
      const log = await git.log({ maxCount: n });
      const lines = log.all.map(
        (c: LogEntry, i: number) =>
          `${i + 1}. ${c.hash.slice(0, 7)} | ${c.message.slice(0, 60)} | ${c.author_name} | ${c.date}`
      );
      return lines.join('\n') || 'No commits found.';
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description: 'Get the current git diff (unstaged changes)',
  parameters: EmptyParams,
  async execute() {
    try {
      const diff = await git.diff(['HEAD']);
      return diff.slice(0, 4000) || 'No changes.';
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const gitStatsTool: ToolDefinition = {
  name: 'git_stats',
  description: 'Get insertions/deletions stats and committer info for the last commit',
  parameters: EmptyParams,
  async execute() {
    try {
      const log = await git.log({ maxCount: 1 });
      const latest = log.latest;
      if (!latest) return 'No commits found.';
      const diffStat = await git.diff(['HEAD~1', 'HEAD', '--stat']).catch(() => 'N/A');
      return [
        `Committer: ${latest.author_name} <${latest.author_email}>`,
        `Date: ${latest.date}`,
        `Message: ${latest.message}`,
        `Stats: ${diffStat.split('\n').slice(-2).join(' ')}`,
      ].join('\n');
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ─── Raw helpers for mini git command ────────────────────────────────────────

export async function getRawGitStatus() {
  return git.status();
}

export async function getRawGitLog(n: number) {
  return git.log({ maxCount: n });
}

export async function getRawGitDiff() {
  return git.diff(['HEAD']);
}
