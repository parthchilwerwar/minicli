import { randomUUID } from 'crypto';
import { sendToTelegram } from './agents/base.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackgroundTask {
  id: string;
  description: string;
  startedAt: string;
  status: 'running' | 'done' | 'failed';
  result?: string;
}

// ─── Async Task Manager ─────────────────────────────────────────────────────

export class AsyncTaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();

  async run(
    description: string,
    task: () => Promise<string>,
    _chatId: number
  ): Promise<string> {
    const id = randomUUID().slice(0, 8);
    const taskEntry: BackgroundTask = {
      id,
      description,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    this.tasks.set(id, taskEntry);

    // Notify user immediately
    void sendToTelegram(`⚙️ running in background: ${description}\nI'll ping you when done. [${id}]`);

    // Fire and forget
    task()
      .then((result) => {
        taskEntry.status = 'done';
        taskEntry.result = result;
        void sendToTelegram(`✅ done [${id}]: ${description}\n\n${result.slice(0, 3500)}`);
      })
      .catch((err: unknown) => {
        taskEntry.status = 'failed';
        const errMsg = err instanceof Error ? err.message : String(err);
        void sendToTelegram(`❌ failed [${id}]: ${description}\n${errMsg}`);
      });

    return id;
  }

  getStatus(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  listActive(): BackgroundTask[] {
    return [...this.tasks.values()].filter((t) => t.status === 'running');
  }

  listAll(): BackgroundTask[] {
    return [...this.tasks.values()];
  }

  formatActive(): string {
    const active = this.listActive();
    if (active.length === 0) return '📋 No active background tasks.';
    const lines = active.map(
      (t) => `⚙️ [${t.id}] ${t.description}\n   started: ${t.startedAt}`
    );
    return `📋 Active tasks (${active.length})\n\n${lines.join('\n\n')}`;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const asyncTasks = new AsyncTaskManager();
