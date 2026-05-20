import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.ticktick.com/open/v1';

function loadToken(): string {
  const token = process.env['TICKTICK_ACCESS_TOKEN'] ?? '';
  if (!token) throw new Error('TICKTICK_ACCESS_TOKEN not set in .env');
  return token;
}

async function ttFetch(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const token = loadToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`TickTick ${res.status}: ${txt.slice(0, 200)}`);
  }
  if (res.status === 204) return {};
  return res.json() as Promise<unknown>;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const EmptyParams = z.object({});

const GetAllParams = z.object({
  limit: z.number().optional().describe('Max tasks to return'),
});

const CreateTaskParams = z.object({
  title: z.string().describe('Task title'),
  dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
  priority: z.number().min(0).max(5).optional().describe('Priority 0-5'),
  projectId: z.string().optional().describe('Project/list ID'),
});

const CompleteTaskParams = z.object({
  taskId: z.string().describe('Task ID'),
  projectId: z.string().describe('Project ID the task belongs to'),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface TTTask {
  id: string; title: string; priority: number;
  dueDate?: string; projectId?: string; status: number;
}

interface TTProject { id: string; name: string; }

interface TTProjectData {
  tasks: TTTask[];
}

// ─── All-tasks helper (iterates projects) ────────────────────────────────────

async function fetchAllTasks(): Promise<TTTask[]> {
  const projects = (await ttFetch('/project')) as TTProject[];
  const allTasks: TTTask[] = [];
  for (const proj of projects) {
    try {
      const data = (await ttFetch(`/project/${proj.id}/data`)) as TTProjectData;
      if (data.tasks) {
        for (const t of data.tasks) {
          allTasks.push({ ...t, projectId: proj.id });
        }
      }
    } catch { /* skip inaccessible projects */ }
  }
  return allTasks;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export const ticktickGetTodayTool: ToolDefinition = {
  name: 'ticktick_get_today',
  description: 'Get all TickTick tasks due today',
  parameters: EmptyParams,
  async execute() {
    const today = new Date().toISOString().split('T')[0];
    const tasks = await fetchAllTasks();
    const due = tasks.filter((t) => t.dueDate?.startsWith(today ?? '') && t.status === 0);
    if (!due.length) return 'No tasks due today.';
    return due.map((t) => `• [P${t.priority}] ${t.title}`).join('\n');
  },
};

export const ticktickGetAllTool: ToolDefinition = {
  name: 'ticktick_get_all',
  description: 'List all active TickTick tasks',
  parameters: GetAllParams,
  async execute(args) {
    const { limit } = GetAllParams.parse(args);
    const tasks = await fetchAllTasks();
    const active = tasks.filter((t) => t.status === 0).slice(0, limit ?? 25);
    if (!active.length) return 'No active tasks.';
    return active.map((t) =>
      `• [P${t.priority}] ${t.title}${t.dueDate ? ` (due ${t.dueDate.slice(0, 10)})` : ''}`
    ).join('\n');
  },
};

export const ticktickCreateTaskTool: ToolDefinition = {
  name: 'ticktick_create_task',
  description: 'Create a new TickTick task',
  parameters: CreateTaskParams,
  async execute(args) {
    const { title, dueDate, priority, projectId } = CreateTaskParams.parse(args);
    const body: Record<string, unknown> = { title };
    if (dueDate) body['dueDate'] = dueDate;
    if (priority !== undefined) body['priority'] = priority;
    if (projectId) body['projectId'] = projectId;
    const task = (await ttFetch('/task', 'POST', body)) as TTTask;
    return `Task created: "${task.title}" (id: ${task.id})`;
  },
};

export const ticktickCompleteTaskTool: ToolDefinition = {
  name: 'ticktick_complete_task',
  description: 'Mark a TickTick task as complete',
  parameters: CompleteTaskParams,
  async execute(args) {
    const { taskId, projectId } = CompleteTaskParams.parse(args);
    await ttFetch(`/project/${projectId}/task/${taskId}/complete`, 'POST');
    return `Task ${taskId} marked complete.`;
  },
};

export const ticktickGetProjectsTool: ToolDefinition = {
  name: 'ticktick_get_projects',
  description: 'List all TickTick projects/lists',
  parameters: EmptyParams,
  async execute() {
    const projects = (await ttFetch('/project')) as TTProject[];
    if (!projects.length) return 'No projects found.';
    return projects.map((p) => `• ${p.name} (id: ${p.id})`).join('\n');
  },
};
