import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import cron from 'node-cron';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { saveMemory, getRecentMemories } from '../memory-store.js';
import { callLLM } from '../llm.js';
import { sendToTelegram } from './base.js';
// ─── Schemas ──────────────────────────────────────────────────────────────────
export const TaskSchema = z.object({
    id: z.string(), title: z.string(), project: z.string().optional(),
    dueDate: z.string().optional(), done: z.boolean(), createdAt: z.string(),
    source: z.enum(['cli', 'telegram']),
});
export const HabitSchema = z.object({
    id: z.string(), goal: z.string(), frequency: z.string(),
    lastMentioned: z.string(), nudgeSentAt: z.string().nullable(),
});
export const ReminderSchema = z.object({
    id: z.string(), content: z.string(), triggerAt: z.string(),
    sent: z.boolean(), createdAt: z.string(),
});
const DIR = path.join(homedir(), '.minicli');
const TASKS_FILE = path.join(DIR, 'tasks.json');
const HABITS_FILE = path.join(DIR, 'habits.json');
const REMINDERS_FILE = path.join(DIR, 'reminders.json');
function ensure() { if (!fs.existsSync(DIR))
    fs.mkdirSync(DIR, { recursive: true }); }
export function loadTasks() {
    ensure();
    if (!fs.existsSync(TASKS_FILE))
        return [];
    try {
        return z.array(TaskSchema).parse(JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')));
    }
    catch {
        return [];
    }
}
export function saveTasks(t) { ensure(); fs.writeFileSync(TASKS_FILE, JSON.stringify(t, null, 2)); }
export function loadHabits() {
    ensure();
    if (!fs.existsSync(HABITS_FILE))
        return [];
    try {
        return z.array(HabitSchema).parse(JSON.parse(fs.readFileSync(HABITS_FILE, 'utf-8')));
    }
    catch {
        return [];
    }
}
export function saveHabits(h) { ensure(); fs.writeFileSync(HABITS_FILE, JSON.stringify(h, null, 2)); }
export function loadReminders() {
    ensure();
    if (!fs.existsSync(REMINDERS_FILE))
        return [];
    try {
        return z.array(ReminderSchema).parse(JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8')));
    }
    catch {
        return [];
    }
}
export function saveReminders(r) { ensure(); fs.writeFileSync(REMINDERS_FILE, JSON.stringify(r, null, 2)); }
// ─── Classify schema ─────────────────────────────────────────────────────────
const ClassifySchema = z.object({
    type: z.enum(['reminder', 'task', 'note', 'habit', 'query']),
    content: z.string(), deadline: z.string().optional(), project: z.string().optional(),
});
// ─── Agent ────────────────────────────────────────────────────────────────────
export class LifeOSAgent {
    name = 'Life OS';
    description = 'Tasks, habits, reminders, morning brief & night recap';
    morningJob = null;
    nightJob = null;
    habitJob = null;
    reminderInterval = null;
    async init() {
        const mc = process.env['LIFE_OS_MORNING_CRON'] ?? '0 7 * * *';
        const nc = process.env['LIFE_OS_NIGHT_CRON'] ?? '0 23 * * *';
        this.morningJob = cron.schedule(mc, () => { void this.morningBrief(); });
        this.nightJob = cron.schedule(nc, () => { void this.nightRecap(); });
        this.habitJob = cron.schedule('0 */6 * * *', () => { void this.habitNudge(); });
        this.reminderInterval = setInterval(() => { void this.checkReminders(); }, 60_000);
    }
    async stop() {
        this.morningJob?.stop();
        this.nightJob?.stop();
        this.habitJob?.stop();
        if (this.reminderInterval)
            clearInterval(this.reminderInterval);
    }
    // ── Behavior B: Capture intercept ──────────────────────────────────────────
    async intercept(message) {
        try {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const ld = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const lt = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
            const prompt = `Today is ${ld} ${lt}. Classify this message. Output JSON only (no markdown):\n{ "type": "reminder"|"task"|"note"|"habit"|"query", "content": "extracted", "deadline": "ISO YYYY-MM-DDTHH:MM or null", "project": "project or null" }\nWhen user says "today" use ${ld}. "tomorrow" = next day.\nMessage: "${message}"`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const c = ClassifySchema.parse(JSON.parse(raw));
            if (c.type === 'query')
                return { handled: false };
            const ts = new Date().toISOString();
            if (c.type === 'habit') {
                const habits = loadHabits();
                habits.push({ id: nanoid(8), goal: c.content, frequency: 'daily', lastMentioned: ts, nudgeSentAt: null });
                saveHabits(habits);
                return { handled: true, response: `✓ Habit goal saved — I'll track: "${c.content.slice(0, 60)}"` };
            }
            if (c.type === 'reminder' && c.deadline) {
                const reminders = loadReminders();
                reminders.push({ id: nanoid(8), content: c.content, triggerAt: c.deadline, sent: false, createdAt: ts });
                saveReminders(reminders);
                const d = new Date(c.deadline);
                const ds = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return { handled: true, response: `✓ Reminder set — "${c.content.slice(0, 60)}" at ${ds}` };
            }
            if (c.type === 'task') {
                const tasks = loadTasks();
                tasks.push({ id: nanoid(8), title: c.content, project: c.project, dueDate: c.deadline?.slice(0, 10), done: false, createdAt: ts, source: 'telegram' });
                saveTasks(tasks);
                void saveMemory({ timestamp: ts, source: 'telegram', type: 'task', messages: [{ role: 'user', content: c.content, timestamp: ts }], dueDate: c.deadline?.slice(0, 10) });
                const dh = c.deadline ? `\nDue: ${c.deadline.slice(0, 10)}` : '';
                const ph = c.project ? `\nLinked to: ${c.project}` : '';
                return { handled: true, response: `✓ Task saved — "${c.content.slice(0, 80)}"${dh}${ph}` };
            }
            void saveMemory({ timestamp: ts, source: 'telegram', type: 'note', messages: [{ role: 'user', content: c.content, timestamp: ts }] });
            return { handled: true, response: `✓ Note saved` };
        }
        catch {
            return { handled: false };
        }
    }
    // ── Behavior A: Morning brief ──────────────────────────────────────────────
    async morningBrief() {
        try {
            const name = process.env['LIFE_OS_NAME'] ?? 'Parth';
            const today = new Date();
            const dayName = today.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
            const tasks = loadTasks().filter((t) => !t.done);
            const habits = loadHabits();
            const reminders = loadReminders().filter((r) => !r.sent);
            const memories = getRecentMemories(20);
            const ctx = [
                `Tasks: ${tasks.map((t) => `- ${t.title} (due: ${t.dueDate ?? 'none'})`).join('\n') || 'none'}`,
                `Habits: ${habits.map((h) => `- ${h.goal} (last: ${h.lastMentioned.slice(0, 10)})`).join('\n') || 'none'}`,
                `Reminders today: ${reminders.filter((r) => r.triggerAt.startsWith(today.toISOString().slice(0, 10))).map((r) => `- ${r.content}`).join('\n') || 'none'}`,
                `Recent: ${memories.slice(0, 10).map((m) => m.title).join(', ') || 'none'}`,
            ].join('\n\n');
            const prompt = `Generate morning brief for ${name}. Output JSON only:\n{ "tasks": ["items"], "reminders": ["items"], "habits": ["status items"], "suggestion": "one AI suggestion" }\n\nContext:\n${ctx.slice(0, 2500)}`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({ tasks: z.array(z.string()), reminders: z.array(z.string()), habits: z.array(z.string()), suggestion: z.string() }).parse(JSON.parse(raw));
            const sections = [
                { emoji: '📋', title: "Today's tasks", lines: data.tasks.length ? data.tasks.map((t) => `• ${t}`) : ['• All clear!'] },
                { emoji: '⏰', title: 'Reminders due today', lines: data.reminders.length ? data.reminders.map((r) => `• ${r}`) : ['• None'] },
                { emoji: '🎯', title: 'Habit check', lines: data.habits.length ? data.habits : ['• No habits tracked yet'] },
                { emoji: '💡', title: 'AI suggestion', lines: [data.suggestion] },
            ];
            await sendToTelegram(`🌅 Good morning, ${name} — ${dayName}\n\n` + sections.map((s) => `${s.emoji} *${s.title}*\n${s.lines.join('\n')}`).join('\n\n'));
        }
        catch (err) {
            console.error('[life-os] morning brief error:', err instanceof Error ? err.message : err);
        }
    }
    // ── Behavior C: Habit nudge ────────────────────────────────────────────────
    async habitNudge() {
        try {
            const habits = loadHabits();
            const now = Date.now();
            let changed = false;
            for (const h of habits) {
                const lastMention = new Date(h.lastMentioned).getTime();
                const daysSince = (now - lastMention) / (1000 * 60 * 60 * 24);
                if (daysSince < 2)
                    continue;
                if (h.nudgeSentAt) {
                    const lastNudge = new Date(h.nudgeSentAt).getTime();
                    if ((now - lastNudge) < 24 * 60 * 60 * 1000)
                        continue;
                }
                await sendToTelegram(`⚡ Quick nudge\nYou haven't mentioned "${h.goal}" in ${Math.floor(daysSince)} days.\nKeep the streak alive!`);
                h.nudgeSentAt = new Date().toISOString();
                changed = true;
            }
            if (changed)
                saveHabits(habits);
        }
        catch { /* best-effort */ }
    }
    // ── Behavior D: Night recap ────────────────────────────────────────────────
    async nightRecap() {
        try {
            const name = process.env['LIFE_OS_NAME'] ?? 'Parth';
            const today = new Date().toISOString().slice(0, 10);
            const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
            const tasks = loadTasks();
            const done = tasks.filter((t) => t.done && t.createdAt.startsWith(today));
            const pending = tasks.filter((t) => !t.done);
            const memories = getRecentMemories(15).filter((m) => m.timestamp.startsWith(today));
            const ctx = `Done: ${done.map((t) => t.title).join(', ') || 'nothing logged'}\nPending: ${pending.slice(0, 5).map((t) => t.title).join(', ') || 'none'}\nToday's activity: ${memories.map((m) => m.title).join(', ') || 'quiet day'}`;
            const prompt = `Generate night recap. Output JSON only:\n{ "done": ["items"], "pending": ["items"], "tomorrow": ["top 3 suggestions"] }\n\n${ctx.slice(0, 2000)}`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({ done: z.array(z.string()), pending: z.array(z.string()), tomorrow: z.array(z.string()) }).parse(JSON.parse(raw));
            const msg = `🌙 Day recap — ${dayName}\n\n` +
                `✅ *Done today*\n${data.done.map((d) => `• ${d}`).join('\n') || '• Nothing logged'}\n\n` +
                `📌 *Still pending*\n${data.pending.map((p) => `• ${p}`).join('\n') || '• All clear'}\n\n` +
                `🎯 *Tomorrow's top 3 (AI suggested)*\n${data.tomorrow.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
            await sendToTelegram(msg);
        }
        catch (err) {
            console.error('[life-os] night recap error:', err instanceof Error ? err.message : err);
        }
    }
    // ── Reminder checker ───────────────────────────────────────────────────────
    async checkReminders() {
        try {
            const reminders = loadReminders();
            const now = new Date();
            let changed = false;
            for (const r of reminders) {
                if (r.sent)
                    continue;
                if (new Date(r.triggerAt) <= now) {
                    await sendToTelegram(`⏰ *Reminder*\n\n${r.content}`);
                    r.sent = true;
                    changed = true;
                }
            }
            if (changed)
                saveReminders(reminders);
        }
        catch { /* best-effort */ }
    }
}
//# sourceMappingURL=life-os.js.map