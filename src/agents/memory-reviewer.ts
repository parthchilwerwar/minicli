import cron from 'node-cron';
import type { Agent } from './base.js';
import { sendToTelegram } from './base.js';
import { graph } from '../knowledge-graph.js';

// ─── Memory Reviewer Agent ──────────────────────────────────────────────────

export class MemoryReviewerAgent implements Agent {
  name = 'memory-reviewer';
  description = 'Weekly memory review — prunes stale nodes and reports graph stats';
  private cronTask: cron.ScheduledTask | null = null;

  async init(): Promise<void> {
    // Run every Sunday at midnight
    this.cronTask = cron.schedule('0 0 * * 0', () => {
      void this.review();
    });
  }

  async stop(): Promise<void> {
    this.cronTask?.stop();
  }

  async review(): Promise<void> {
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
    } catch {
      // best-effort
    }
  }
}

export const memoryReviewerAgent = new MemoryReviewerAgent();
