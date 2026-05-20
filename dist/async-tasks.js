import { randomUUID } from 'crypto';
import { sendToTelegram } from './agents/base.js';
// ─── Async Task Manager ─────────────────────────────────────────────────────
export class AsyncTaskManager {
    tasks = new Map();
    async run(description, task, _chatId) {
        const id = randomUUID().slice(0, 8);
        const taskEntry = {
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
            .catch((err) => {
            taskEntry.status = 'failed';
            const errMsg = err instanceof Error ? err.message : String(err);
            void sendToTelegram(`❌ failed [${id}]: ${description}\n${errMsg}`);
        });
        return id;
    }
    getStatus(id) {
        return this.tasks.get(id);
    }
    listActive() {
        return [...this.tasks.values()].filter((t) => t.status === 'running');
    }
    listAll() {
        return [...this.tasks.values()];
    }
    formatActive() {
        const active = this.listActive();
        if (active.length === 0)
            return '📋 No active background tasks.';
        const lines = active.map((t) => `⚙️ [${t.id}] ${t.description}\n   started: ${t.startedAt}`);
        return `📋 Active tasks (${active.length})\n\n${lines.join('\n\n')}`;
    }
}
// ─── Singleton ───────────────────────────────────────────────────────────────
export const asyncTasks = new AsyncTaskManager();
//# sourceMappingURL=async-tasks.js.map