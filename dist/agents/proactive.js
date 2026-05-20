import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import cron from 'node-cron';
import { z } from 'zod';
import { sendToTelegram } from './base.js';
import { graph } from '../knowledge-graph.js';
import { callLLM } from '../llm.js';
import { loadUserMd } from '../persona.js';
import { getSystemPrompt } from '../system-prompt.js';
// ─── Proactive Log Schema ────────────────────────────────────────────────────
const LogEntrySchema = z.object({
    topic: z.string(),
    sentAt: z.string(),
    suppressUntil: z.string().optional(),
});
const ProactiveLogSchema = z.object({
    entries: z.array(LogEntrySchema),
    lastSentAt: z.string().optional(),
});
// ─── Paths ───────────────────────────────────────────────────────────────────
const LOG_PATH = join(homedir(), '.minicli', 'proactive-log.json');
// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadLog() {
    const dir = join(homedir(), '.minicli');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    if (!existsSync(LOG_PATH))
        return { entries: [] };
    try {
        return ProactiveLogSchema.parse(JSON.parse(readFileSync(LOG_PATH, 'utf-8')));
    }
    catch {
        return { entries: [] };
    }
}
function saveLog(log) {
    writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}
function hoursSince(isoStr) {
    return (Date.now() - new Date(isoStr).getTime()) / (1000 * 60 * 60);
}
// ─── Proactive Agent ─────────────────────────────────────────────────────────
export class ProactiveAgent {
    name = 'proactive';
    description = 'Monitors knowledge graph and proactively sends useful insights';
    cronTask = null;
    warmupTimer = null;
    async init() {
        // Run every 4 hours
        this.cronTask = cron.schedule('0 */4 * * *', () => {
            void this.check();
        });
        // Warmup check 2 minutes after start
        this.warmupTimer = setTimeout(() => {
            void this.check();
        }, 2 * 60 * 1000);
    }
    async stop() {
        this.cronTask?.stop();
        if (this.warmupTimer)
            clearTimeout(this.warmupTimer);
    }
    async check() {
        try {
            const log = loadLog();
            // Rate limit: max 1 per 4 hours
            if (log.lastSentAt && hoursSince(log.lastSentAt) < 4)
                return;
            // Load recent graph nodes (last 48h)
            await graph.load();
            const allNodes = graph.getAllNodes();
            const cutoff = new Date();
            cutoff.setHours(cutoff.getHours() - 48);
            const recentNodes = allNodes.filter((n) => new Date(n.updatedAt) > cutoff);
            if (recentNodes.length === 0)
                return;
            // Load user patterns
            let userPatterns = '';
            try {
                userPatterns = loadUserMd();
            }
            catch { /* no profile yet */ }
            const memoryContext = recentNodes
                .slice(0, 20)
                .map((n) => `[${n.type}] ${n.label}: ${n.content}`)
                .join('\n');
            // Suppressed topics
            const now = new Date().toISOString();
            const suppressedTopics = log.entries
                .filter((e) => e.suppressUntil && e.suppressUntil > now)
                .map((e) => e.topic);
            // Recently sent topics (24h)
            const recentTopics = log.entries
                .filter((e) => hoursSince(e.sentAt) < 24)
                .map((e) => e.topic);
            const systemPrompt = getSystemPrompt();
            const prompt = `Review these recent memories and user patterns.
Is there anything worth proactively telling the user right now?
Consider: overdue tasks, pattern breaks, opportunities, stuck projects.

Rules:
- Only send if genuinely useful, not just to say something
- Max 1 proactive message per 4 hours
- Never repeat something sent in last 24h
- Keep message to 2 lines max, direct, no fluff
- Do NOT mention these topics (recently sent or suppressed): ${[...recentTopics, ...suppressedTopics].join(', ') || 'none'}

Recent memories:
${memoryContext}

User patterns:
${userPatterns.slice(0, 1000) || 'no profile yet'}

Output JSON only (no markdown): { "shouldSend": boolean, "message": "string or null", "reason": "string or null", "topic": "short topic label" }`;
            const res = await callLLM([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const decision = JSON.parse(raw);
            if (decision.shouldSend && decision.message) {
                await sendToTelegram(decision.message);
                // Log it
                log.entries.push({
                    topic: decision.topic ?? 'general',
                    sentAt: now,
                });
                log.lastSentAt = now;
                saveLog(log);
                // Also store in knowledge graph
                await graph.addNode({
                    type: 'finding',
                    label: `proactive: ${decision.topic ?? 'insight'}`,
                    content: decision.message,
                    tags: ['proactive', decision.topic ?? 'general'],
                });
            }
        }
        catch {
            // Proactive is best-effort, never crash the daemon
        }
    }
    // Call this when user responds negatively to suppress topic
    suppressTopic(topic, days = 7) {
        const log = loadLog();
        const suppressUntil = new Date();
        suppressUntil.setDate(suppressUntil.getDate() + days);
        const existing = log.entries.find((e) => e.topic === topic);
        if (existing) {
            existing.suppressUntil = suppressUntil.toISOString();
        }
        else {
            log.entries.push({
                topic,
                sentAt: new Date().toISOString(),
                suppressUntil: suppressUntil.toISOString(),
            });
        }
        saveLog(log);
    }
}
export const proactiveAgent = new ProactiveAgent();
//# sourceMappingURL=proactive.js.map