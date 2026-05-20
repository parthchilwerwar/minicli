import cron from 'node-cron';
import { sendToTelegram } from './base.js';
import { graph } from '../knowledge-graph.js';
// ─── Memory Reviewer Agent ──────────────────────────────────────────────────
export class MemoryReviewerAgent {
    name = 'memory-reviewer';
    description = 'Weekly memory review — prunes stale nodes and reports graph stats';
    cronTask = null;
    async init() {
        // Run every Sunday at midnight
        this.cronTask = cron.schedule('0 0 * * 0', () => {
            void this.review();
        });
    }
    async stop() {
        this.cronTask?.stop();
    }
    async review() {
        try {
            await graph.load();
            // Prune conversations older than 30 days, facts older than 90 days
            const convPruned = await graph.prune(30, ['conversation']);
            const factPruned = await graph.prune(90, ['fact']);
            const summary = await graph.summarize();
            const report = [
                '🧠 Weekly Memory Review',
                '',
                `Graph: ${summary}`,
                convPruned > 0 ? `Pruned ${convPruned} old conversations (30d+)` : 'No conversations pruned',
                factPruned > 0 ? `Pruned ${factPruned} stale facts (90d+)` : 'No facts pruned',
            ].join('\n');
            await sendToTelegram(report);
        }
        catch {
            // best-effort
        }
    }
}
export const memoryReviewerAgent = new MemoryReviewerAgent();
//# sourceMappingURL=memory-reviewer.js.map