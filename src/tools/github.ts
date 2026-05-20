import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ghToken(): string {
  return process.env['GITHUB_TOKEN'] ?? '';
}

function ghOwner(override?: string): string {
  return override ?? process.env['GITHUB_DEFAULT_OWNER'] ?? '';
}

function ghRepo(override?: string): string {
  return override ?? process.env['GITHUB_DEFAULT_REPO'] ?? '';
}

async function ghFetch(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const token = ghToken();
  if (!token) throw new Error('GITHUB_TOKEN not set in .env');
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<unknown>;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ListPRsParams = z.object({
  repo: z.string().optional().describe('Repository name'),
  owner: z.string().optional().describe('Repository owner'),
});

const CreatePRParams = z.object({
  title: z.string().describe('PR title'),
  body: z.string().describe('PR description'),
  head: z.string().describe('Source branch'),
  base: z.string().describe('Target branch'),
  repo: z.string().optional(),
  owner: z.string().optional(),
});

const ListIssuesParams = z.object({
  repo: z.string().optional(),
  owner: z.string().optional(),
  label: z.string().optional().describe('Filter by label'),
});

const CreateIssueParams = z.object({
  title: z.string().describe('Issue title'),
  body: z.string().describe('Issue body'),
  labels: z.array(z.string()).optional(),
  repo: z.string().optional(),
  owner: z.string().optional(),
});

const WorkflowRunsParams = z.object({
  repo: z.string().optional(),
  owner: z.string().optional(),
});

const MergePRParams = z.object({
  pr_number: z.number().describe('PR number to merge'),
  repo: z.string().optional(),
  owner: z.string().optional(),
});

// ─── Types for GitHub API responses ──────────────────────────────────────────

interface GHPullRequest {
  number: number; title: string; user: { login: string };
  created_at: string; html_url: string; draft: boolean;
}

interface GHIssue {
  number: number; title: string; user: { login: string };
  labels: Array<{ name: string }>; html_url: string;
}

interface GHWorkflowRun {
  name: string; status: string; conclusion: string | null;
  head_branch: string; html_url: string;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export const githubListPRsTool: ToolDefinition = {
  name: 'github_list_prs',
  description: 'List open pull requests on a GitHub repository',
  parameters: ListPRsParams,
  async execute(args) {
    const { repo, owner } = ListPRsParams.parse(args);
    const o = ghOwner(owner); const r = ghRepo(repo);
    if (!o || !r) return 'ERROR: owner or repo not set. Pass them or set GITHUB_DEFAULT_OWNER/REPO.';
    const data = (await ghFetch(`/repos/${o}/${r}/pulls?state=open&per_page=15`)) as GHPullRequest[];
    if (!data.length) return `No open PRs on ${o}/${r}.`;
    return data.map((pr) =>
      `#${pr.number} ${pr.title} (by ${pr.user.login})${pr.draft ? ' [DRAFT]' : ''}\n  ${pr.html_url}`
    ).join('\n\n');
  },
};

export const githubCreatePRTool: ToolDefinition = {
  name: 'github_create_pr',
  description: 'Create a pull request on a GitHub repository',
  parameters: CreatePRParams,
  async execute(args) {
    const { title, body, head, base, repo, owner } = CreatePRParams.parse(args);
    const o = ghOwner(owner); const r = ghRepo(repo);
    if (!o || !r) return 'ERROR: owner or repo not set.';
    const pr = (await ghFetch(`/repos/${o}/${r}/pulls`, 'POST', { title, body, head, base })) as GHPullRequest;
    return `PR #${pr.number} created: ${pr.html_url}`;
  },
};

export const githubListIssuesTool: ToolDefinition = {
  name: 'github_list_issues',
  description: 'List open issues on a GitHub repository',
  parameters: ListIssuesParams,
  async execute(args) {
    const { repo, owner, label } = ListIssuesParams.parse(args);
    const o = ghOwner(owner); const r = ghRepo(repo);
    if (!o || !r) return 'ERROR: owner or repo not set.';
    const q = label ? `&labels=${encodeURIComponent(label)}` : '';
    const data = (await ghFetch(`/repos/${o}/${r}/issues?state=open&per_page=15${q}`)) as GHIssue[];
    if (!data.length) return `No open issues on ${o}/${r}.`;
    return data.map((i) =>
      `#${i.number} ${i.title} (by ${i.user.login}) [${i.labels.map((l) => l.name).join(', ')}]`
    ).join('\n');
  },
};

export const githubCreateIssueTool: ToolDefinition = {
  name: 'github_create_issue',
  description: 'Create a new issue on a GitHub repository',
  parameters: CreateIssueParams,
  async execute(args) {
    const { title, body, labels, repo, owner } = CreateIssueParams.parse(args);
    const o = ghOwner(owner); const r = ghRepo(repo);
    if (!o || !r) return 'ERROR: owner or repo not set.';
    const issue = (await ghFetch(`/repos/${o}/${r}/issues`, 'POST', { title, body, labels })) as GHIssue;
    return `Issue #${issue.number} created: ${issue.html_url}`;
  },
};

export const githubWorkflowRunsTool: ToolDefinition = {
  name: 'github_get_workflow_runs',
  description: 'Get recent CI/CD workflow runs for a repository',
  parameters: WorkflowRunsParams,
  async execute(args) {
    const { repo, owner } = WorkflowRunsParams.parse(args);
    const o = ghOwner(owner); const r = ghRepo(repo);
    if (!o || !r) return 'ERROR: owner or repo not set.';
    const data = (await ghFetch(`/repos/${o}/${r}/actions/runs?per_page=10`)) as {
      workflow_runs: GHWorkflowRun[];
    };
    if (!data.workflow_runs.length) return 'No workflow runs found.';
    return data.workflow_runs.map((w) =>
      `${w.name} — ${w.status}${w.conclusion ? ` (${w.conclusion})` : ''} on ${w.head_branch}`
    ).join('\n');
  },
};

export const githubMergePRTool: ToolDefinition = {
  name: 'github_merge_pr',
  description: 'Merge a pull request by number',
  parameters: MergePRParams,
  async execute(args) {
    const { pr_number, repo, owner } = MergePRParams.parse(args);
    const o = ghOwner(owner); const r = ghRepo(repo);
    if (!o || !r) return 'ERROR: owner or repo not set.';
    await ghFetch(`/repos/${o}/${r}/pulls/${pr_number}/merge`, 'PUT', { merge_method: 'squash' });
    return `PR #${pr_number} merged successfully.`;
  },
};
