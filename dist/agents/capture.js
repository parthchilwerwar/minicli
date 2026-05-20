import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import cron from 'node-cron';
import { z } from 'zod';
import { saveMemory } from '../memory-store.js';
import { callLLM } from '../llm.js';
import { sendToTelegram } from './base.js';
// ─── Schema ───────────────────────────────────────────────────────────────────
const ClassifySchema = z.object({
    type: z.enum(['reminder', 'idea', 'task', 'note', 'query']),
    content: z.string(),
    deadline: z.string().optional(),
    project: z.string().optional(),
});
const ReminderSchema = z.object({
    id: z.string(),
    content: z.string(),
    deadline: z.string(),
    cronExpr: z.string(),
});
// ─── Persistence ─────────────────────────────────────────────────────────────
const ROUTINES_FILE = path.join(homedir(), '.minicli', 'capture-reminders.json');
function loadReminders() {
    if (!fs.existsSync(ROUTINES_FILE))
        return [];
    try {
        return z.array(ReminderSchema).parse(JSON.parse(fs.readFileSync(ROUTINES_FILE, 'utf-8')));
    }
    catch {
        return [];
    }
}
function saveReminders(reminders) {
    fs.mkdirSync(path.dirname(ROUTINES_FILE), { recursive: true });
    fs.writeFileSync(ROUTINES_FILE, JSON.stringify(reminders, null, 2));
}
// ─── Agent ────────────────────────────────────────────────────────────────────
export class CaptureAgent {
    name = 'capture';
    description = 'Intercepts and classifies every Telegram message';
    cronJobs = new Map();
    async init() {
        // Restore any pending reminders
        const reminders = loadReminders();
        for (const r of reminders) {
            const deadlineDate = new Date(r.deadline);
            if (deadlineDate > new Date()) {
                this.scheduleReminderCron(r.id, r.content, r.cronExpr);
            }
        }
    }
    async stop() {
        for (const job of this.cronJobs.values())
            job.stop();
        this.cronJobs.clear();
    }
    async intercept(message) {
        try {
            // Build a local-date-aware "now" string so the LLM can resolve
            // relative expressions like "today", "tomorrow", "8:30pm today".
            const nowLocal = new Date();
            // Format: "Sunday, 2026-04-19, 18:30 IST" (locale-independent via manual format)
            const pad = (n) => String(n).padStart(2, '0');
            const localDateStr = `${nowLocal.getFullYear()}-${pad(nowLocal.getMonth() + 1)}-${pad(nowLocal.getDate())}`;
            const localTimeStr = `${pad(nowLocal.getHours())}:${pad(nowLocal.getMinutes())}`;
            const tzOffset = -nowLocal.getTimezoneOffset(); // minutes
            const tzSign = tzOffset >= 0 ? '+' : '-';
            const tzHours = pad(Math.floor(Math.abs(tzOffset) / 60));
            const tzMins = pad(Math.abs(tzOffset) % 60);
            const nowContext = `Today is ${localDateStr} ${localTimeStr} (UTC${tzSign}${tzHours}:${tzMins}).`;
            const prompt = `${nowContext}\nClassify this message. Output JSON only (no markdown):\n{ "type": "reminder"|"idea"|"task"|"note"|"query", "content": "extracted content", "deadline": "ISO datetime (YYYY-MM-DDTHH:MM) resolved from the message using today's date above, or null if no time mentioned", "project": "project name if mentioned or null" }\n\nWhen the user says "today", use ${localDateStr}. When they say "tomorrow", use the next calendar day.\n\nMessage: "${message}"`;
            const res = await callLLM([{ role: 'user', content: prompt }], [], undefined, false);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const classify = ClassifySchema.parse(JSON.parse(raw));
            if (classify.type === 'query')
                return { handled: false };
            const now = new Date().toISOString();
            const source = 'telegram';
            // Save to memory store
            void saveMemory({
                timestamp: now,
                source,
                type: classify.type === 'reminder' ? 'reminder'
                    : classify.type === 'task' ? 'task'
                        : 'note',
                messages: [{ role: 'user', content: classify.content, timestamp: now }],
                // Persist due date so tasks can be queried by date later
                dueDate: (classify.type === 'task' || classify.type === 'reminder') && classify.deadline
                    ? classify.deadline.slice(0, 10) // keep only YYYY-MM-DD
                    : undefined,
            });
            // Schedule reminder if needed
            if (classify.type === 'reminder' && classify.deadline) {
                await this.scheduleReminder(classify.content, classify.deadline);
                const date = new Date(classify.deadline);
                const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return { handled: true, response: `Reminder set ✓\n"${classify.content.slice(0, 60)}" — I'll remind you ${dateStr}` };
            }
            if (classify.type === 'task') {
                const proj = classify.project ? `\nLinked to: ${classify.project}` : '';
                let dateHint = '';
                if (classify.deadline) {
                    const d = new Date(classify.deadline);
                    if (!isNaN(d.getTime())) {
                        dateHint = `\nDue: ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (${classify.deadline.slice(0, 10)})`;
                    }
                }
                return { handled: true, response: `Task saved ✓\n"${classify.content.slice(0, 80)}"${dateHint}${proj}` };
            }
            if (classify.type === 'idea') {
                const proj = classify.project ? `\nLinked to: ${classify.project}` : '';
                return { handled: true, response: `Idea saved ✓${proj}` };
            }
            return { handled: true, response: `Note saved ✓` };
        }
        catch {
            return { handled: false }; // fall through to main loop on error
        }
    }
    async scheduleReminder(content, deadline) {
        const d = new Date(deadline);
        if (isNaN(d.getTime()) || d <= new Date())
            return;
        const cronExpr = `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
        const id = `reminder-${Date.now()}`;
        const existing = loadReminders();
        existing.push({ id, content, deadline, cronExpr });
        saveReminders(existing);
        this.scheduleReminderCron(id, content, cronExpr);
    }
    scheduleReminderCron(id, content, cronExpr) {
        try {
            const job = cron.schedule(cronExpr, () => {
                void sendToTelegram(`⏰ *Reminder*\n\n${content}`);
                job.stop();
                this.cronJobs.delete(id);
                const reminders = loadReminders().filter((r) => r.id !== id);
                saveReminders(reminders);
            });
            this.cronJobs.set(id, job);
        }
        catch { /* invalid cron expr — skip */ }
    }
}
//# sourceMappingURL=capture.js.map