import cron from 'node-cron';
import { z } from 'zod';
import { getRecentMemories, saveMemory } from '../memory-store.js';
import { loadPersona } from '../persona.js';
import { callLLM } from '../llm.js';
import { sendToTelegram, formatMessage } from './base.js';
// ─── Schema ───────────────────────────────────────────────────────────────────
const BriefSchema = z.object({
    todayFocus: z.array(z.string()),
    pendingYesterday: z.array(z.string()),
    suggestions: z.array(z.string()),
    quickNote: z.string(),
});
// ─── Agent ────────────────────────────────────────────────────────────────────
export class MorningBriefAgent {
    name = 'morning-brief';
    description = 'Sends a daily morning briefing at 7am';
    task = null;
    async init() {
        const cronExpr = process.env['MORNING_BRIEF_TIME'] ?? '0 7 * * *';
        this.task = cron.schedule(cronExpr, () => { void this.generateAndSend(); });
    }
    async stop() {
        this.task?.stop();
        this.task = null;
    }
    async generateAndSend() {
        try {
            const name = process.env['MORNING_BRIEF_NAME'] ?? 'Parth';
            const persona = loadPersona();
            const memories = getRecentMemories(30);
            const tasks = memories.filter((m) => m.type === 'task').slice(0, 10);
            const recent = memories.slice(0, 20);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);
            const fromYesterday = memories.filter((m) => m.timestamp.startsWith(yesterdayStr));
            const memContext = recent.map((m) => `[${m.type}] ${m.title}: ${m.summary}`).join('\n');
            const taskList = tasks.map((t) => `- ${t.title}`).join('\n') || 'none';
            const yList = fromYesterday.map((m) => `- ${m.title}`).join('\n') || 'none';
            const prompt = `${persona}\n\nGenerate a morning brief for ${name} based on:\n\nPending tasks:\n${taskList}\n\nYesterday's items:\n${yList}\n\nRecent context:\n${memContext.slice(0, 2000)}\n\nOutput JSON only:\n{ "todayFocus": ["3 items"], "pendingYesterday": ["from yesterday"], "suggestions": ["3 AI suggestions"], "quickNote": "one line" }`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = BriefSchema.parse(JSON.parse(raw));
            const todayFocusContent = data.todayFocus.map((t) => `• ${t}`).join('\n');
            const pendingContent = data.pendingYesterday.length
                ? data.pendingYesterday.map((t) => `• ${t}`).join('\n')
                : '• All clear!';
            const suggestionsContent = data.suggestions.map((s) => `• ${s}`).join('\n');
            const message = `🌅 *Good morning, ${name}*\n\n` + formatMessage([
                { emoji: '📅', title: "Today's focus", content: todayFocusContent },
                { emoji: '💡', title: 'Pending from yesterday', content: pendingContent },
                { emoji: '⚡', title: 'Suggested priorities', content: suggestionsContent },
                { emoji: '🌤', title: 'Quick note', content: data.quickNote },
            ]);
            await sendToTelegram(message);
            void saveMemory({
                timestamp: new Date().toISOString(),
                source: 'telegram',
                type: 'note',
                messages: [{ role: 'assistant', content: message, timestamp: new Date().toISOString() }],
            });
        }
        catch (err) {
            console.error('[morning-brief] Error:', err instanceof Error ? err.message : err);
        }
    }
}
//# sourceMappingURL=morning-brief.js.map