import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadNotes, loadRoutines, loadContext, saveContext, clearContext } from './memory.js';
import { quickLLM } from './llm.js';
import { webSearchTool } from './tools/search.js';
import { success, error, info } from './ui.js';
import { readFileSync } from 'fs';
import { z } from 'zod';
const CYAN = chalk.cyan;
const DIM = chalk.gray;
const WHITE = chalk.white;
const YELLOW = chalk.yellow;
const LIME = chalk.hex('#b5f300');
const HR = CYAN('━'.repeat(42));
// ─── Daily Dashboard ─────────────────────────────────────────────────────────
export async function doDashboard() {
    const ctx = loadContext();
    const name = ctx.name ?? '';
    const now = new Date();
    console.log('\n' + HR);
    console.log('  ' + YELLOW('🌅') + '  ' + CYAN(name ? `GOOD MORNING, ${name.toUpperCase()}` : 'GOOD MORNING'));
    console.log('  ' + DIM(now.toLocaleString()));
    console.log(HR + '\n');
    // ── Routines ───────────────────────────────────────────────────────────────
    console.log(CYAN("📋  TODAY'S ROUTINES"));
    const routines = loadRoutines();
    if (routines.length === 0) {
        console.log('  ' + DIM('No routines configured. Run: mini routine add "description"'));
    }
    else {
        routines.forEach((r) => {
            const sched = r.once ? '(once)' : (r.cronExpr ?? 'manual');
            console.log('  ' + LIME('·') + '  ' + WHITE(r.desc) + '  ' + DIM(sched));
        });
    }
    console.log('');
    // ── Recent Notes ───────────────────────────────────────────────────────────
    console.log(CYAN('📝  RECENT NOTES'));
    const notes = loadNotes().slice(-3).reverse();
    if (notes.length === 0) {
        console.log('  ' + DIM('No notes yet. Run: mini note "text"'));
    }
    else {
        notes.forEach((n) => {
            console.log('  ' + LIME('·') + '  ' + WHITE(n.text.slice(0, 72)));
        });
    }
    console.log('');
    // ── Weather ────────────────────────────────────────────────────────────────
    console.log(CYAN('🌤️   WEATHER'));
    try {
        const location = typeof ctx.preferences === 'object' && ctx.preferences !== null
            ? ctx.preferences['location'] ?? ''
            : '';
        const q = location ? `weather today ${location}` : 'weather today';
        const result = await webSearchTool.execute({ query: q });
        // Show just the first result snippet
        const firstLine = result.split('\n').find((l) => l.trim() && !l.startsWith('['));
        console.log('  ' + WHITE(firstLine ?? result.slice(0, 120)));
    }
    catch {
        console.log('  ' + DIM('Could not fetch weather.'));
    }
    console.log('');
    // ── Suggested Tasks ────────────────────────────────────────────────────────
    console.log(CYAN('✅  SUGGESTED TASKS'));
    try {
        const ctxSummary = [
            ctx.goals ? `Goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}` : '',
            ctx.habits ? `Habits: ${Array.isArray(ctx.habits) ? ctx.habits.join(', ') : ctx.habits}` : '',
            notes.length ? `Recent notes: ${notes.map((n) => n.text.slice(0, 40)).join('; ')}` : '',
        ].filter(Boolean).join('\n');
        const prompt = `Based on this context:\n${ctxSummary || 'No context set.'}\n\nSuggest exactly 3 short actionable tasks for today. Output ONLY a numbered list, nothing else.`;
        const tasks = await quickLLM(prompt);
        tasks.split('\n')
            .filter((l) => /^\d+\./.test(l.trim()))
            .slice(0, 3)
            .forEach((t) => console.log('  ' + YELLOW('·') + '  ' + WHITE(t.replace(/^\d+\.\s*/, ''))));
    }
    catch {
        console.log('  ' + DIM('Could not generate suggestions.'));
    }
    console.log('');
    console.log(HR + '\n');
}
// ─── Text Dashboard (for Telegram) ───────────────────────────────────────────
export async function doDashboardText() {
    const ctx = loadContext();
    const name = ctx.name ?? '';
    const now = new Date();
    const lines = [];
    lines.push(`🌅 ${name ? `Good morning, ${name}!` : 'Good morning!'}`);
    lines.push(now.toLocaleString());
    lines.push('');
    lines.push('📋 ROUTINES');
    const routines = loadRoutines();
    if (!routines.length)
        lines.push('  No routines configured.');
    else
        routines.forEach((r) => lines.push(`  · ${r.desc} (${r.cronExpr ?? 'manual'})`));
    lines.push('');
    lines.push('📝 RECENT NOTES');
    const notes = loadNotes().slice(-3).reverse();
    if (!notes.length)
        lines.push('  No notes yet.');
    else
        notes.forEach((n) => lines.push(`  · ${n.text.slice(0, 72)}`));
    lines.push('');
    lines.push('✅ SUGGESTED TASKS');
    try {
        const ctxSummary = [
            ctx.goals ? `Goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}` : '',
            ctx.habits ? `Habits: ${Array.isArray(ctx.habits) ? ctx.habits.join(', ') : ctx.habits}` : '',
        ].filter(Boolean).join('\n');
        const tasks = await quickLLM(`Based on this context:\n${ctxSummary || 'No context set.'}\n\nSuggest exactly 3 short actionable tasks for today. Output ONLY a numbered list, nothing else.`);
        tasks.split('\n').filter((l) => /^\d+\./.test(l.trim())).slice(0, 3).forEach((t) => lines.push(`  · ${t.replace(/^\d+\.\s*/, '')}`));
    }
    catch {
        lines.push('  Could not generate suggestions.');
    }
    return lines.join('\n');
}
// ─── Context Commands ─────────────────────────────────────────────────────────
export async function contextSet() {
    const existing = loadContext();
    const answers = await inquirer.prompt([
        { type: 'input', name: 'name', message: 'Your name:', default: existing.name ?? '' },
        { type: 'input', name: 'bio', message: 'Short bio:', default: existing.bio ?? '' },
        { type: 'input', name: 'goals', message: 'Goals (comma-separated):', default: Array.isArray(existing.goals) ? existing.goals.join(', ') : (existing.goals ?? '') },
        { type: 'input', name: 'habits', message: 'Habits (comma-separated):', default: Array.isArray(existing.habits) ? existing.habits.join(', ') : (existing.habits ?? '') },
        { type: 'input', name: 'location', message: 'Location (for weather):', default: (typeof existing.preferences === 'object' && existing.preferences !== null ? existing.preferences['location'] : '') ?? '' },
    ]);
    saveContext({
        name: answers.name || undefined,
        bio: answers.bio || undefined,
        goals: answers.goals ? answers.goals.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        habits: answers.habits ? answers.habits.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        preferences: answers.location ? { location: answers.location } : undefined,
    });
    success('Context saved.');
}
export function contextShow() {
    const ctx = loadContext();
    if (Object.keys(ctx).length === 0) {
        info('No context set. Run: mini context set');
        return;
    }
    console.log('');
    console.log('  ' + CYAN('Personal Context'));
    console.log('  ' + DIM('─'.repeat(36)));
    if (ctx.name)
        console.log('  ' + DIM('Name: ') + WHITE(ctx.name));
    if (ctx.bio)
        console.log('  ' + DIM('Bio: ') + WHITE(ctx.bio));
    if (ctx.goals)
        console.log('  ' + DIM('Goals: ') + WHITE(Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals));
    if (ctx.habits)
        console.log('  ' + DIM('Habits: ') + WHITE(Array.isArray(ctx.habits) ? ctx.habits.join(', ') : ctx.habits));
    if (ctx.preferences && typeof ctx.preferences === 'object') {
        const prefs = ctx.preferences;
        Object.entries(prefs).forEach(([k, v]) => console.log('  ' + DIM(`${k}: `) + WHITE(v)));
    }
    if (ctx.updatedAt)
        console.log('  ' + DIM('Updated: ') + DIM(new Date(ctx.updatedAt).toLocaleString()));
    console.log('');
}
export function contextClear() {
    clearContext();
    success('Context cleared.');
}
export function contextExport() {
    const ctx = loadContext();
    console.log(JSON.stringify(ctx, null, 2));
}
export function contextLoad(file) {
    try {
        const raw = JSON.parse(readFileSync(file, 'utf-8'));
        saveContext(raw);
        success('Context loaded from ' + file);
    }
    catch (err) {
        error('Failed to load context: ' + (err instanceof Error ? err.message : String(err)));
    }
}
export async function contextAuto() {
    info('Generating context automatically from notes and history...');
    try {
        const ContextAutoSchema = z.object({
            name: z.string().optional(),
            bio: z.string().optional(),
            goals: z.array(z.string()).optional(),
            habits: z.array(z.string()).optional(),
            preferences: z.record(z.string()).optional(),
        });
        const res = await quickLLM('Analyze the user profile implied by this CLI session. Output ONLY valid JSON with keys: name, bio, goals (array), habits (array), preferences (object). No markdown.');
        const clean = res.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        const data = ContextAutoSchema.parse(JSON.parse(clean));
        saveContext(data);
        success('Auto context saved.');
        contextShow();
    }
    catch (err) {
        error('Auto context failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}
//# sourceMappingURL=dashboard.js.map