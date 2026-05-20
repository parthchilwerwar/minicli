import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
const CONFIG_DIR = join(homedir(), '.minicli');
const NOTES_FILE = join(CONFIG_DIR, 'notes.json');
const HISTORY_FILE = join(CONFIG_DIR, 'history.json');
const ROUTINES_FILE = join(CONFIG_DIR, 'routines.json');
const CONTEXT_FILE = join(CONFIG_DIR, 'context.json');
// ─── Zod Schemas (single source of truth) ────────────────────────────────────
const NoteSchema = z.object({
    id: z.string(),
    text: z.string(),
    tags: z.array(z.string()),
    ts: z.number(),
    kind: z.literal('note'),
});
const RoutineSchema = z.object({
    id: z.string(),
    desc: z.string(),
    cronExpr: z.string().optional(),
    once: z.boolean().optional(),
    lastRun: z.number().optional(),
});
const ContextSchema = z.object({
    name: z.string().optional(),
    bio: z.string().optional(),
    goals: z.union([z.string(), z.array(z.string())]).optional(),
    habits: z.union([z.string(), z.array(z.string())]).optional(),
    preferences: z.union([z.string(), z.record(z.string())]).optional(),
    updatedAt: z.string().optional(),
});
const ToolCallSchema = z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({ name: z.string(), arguments: z.string() }),
});
const MessageSchema = z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string().optional(),
    tool_calls: z.array(ToolCallSchema).optional(),
    tool_call_id: z.string().optional(),
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
function ensureDir() {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
}
function safeRead(file, schema) {
    ensureDir();
    if (!existsSync(file))
        return [];
    try {
        return schema.parse(JSON.parse(readFileSync(file, 'utf-8')));
    }
    catch {
        return [];
    }
}
function safeReadObj(file, schema, fallback) {
    ensureDir();
    if (!existsSync(file))
        return fallback;
    try {
        return schema.parse(JSON.parse(readFileSync(file, 'utf-8')));
    }
    catch {
        return fallback;
    }
}
// ─── Notes ───────────────────────────────────────────────────────────────────
export function loadNotes() {
    return safeRead(NOTES_FILE, z.array(NoteSchema));
}
export function saveNote(text, tags) {
    const notes = loadNotes();
    const note = { id: uuidv4().slice(0, 8), text, tags, ts: Date.now(), kind: 'note' };
    notes.push(note);
    writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
    return note;
}
export function deleteNote(id) {
    const notes = loadNotes();
    const filtered = notes.filter((n) => n.id !== id);
    if (filtered.length === notes.length)
        return false;
    writeFileSync(NOTES_FILE, JSON.stringify(filtered, null, 2));
    return true;
}
export function searchNotes(query) {
    const q = query.toLowerCase();
    return loadNotes().filter((n) => n.text.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)));
}
export function filterByTag(tag) {
    const t = tag.toLowerCase();
    return loadNotes().filter((n) => n.tags.map((x) => x.toLowerCase()).includes(t));
}
// ─── History ─────────────────────────────────────────────────────────────────
export function loadHistory() {
    return safeRead(HISTORY_FILE, z.array(MessageSchema));
}
export function saveHistory(messages) {
    ensureDir();
    writeFileSync(HISTORY_FILE, JSON.stringify(messages.slice(-40), null, 2));
}
export function clearHistory() {
    ensureDir();
    writeFileSync(HISTORY_FILE, '[]');
}
export function appendHistory(message) {
    const history = loadHistory();
    history.push(message);
    saveHistory(history);
}
// ─── Routines ────────────────────────────────────────────────────────────────
export function loadRoutines() {
    return safeRead(ROUTINES_FILE, z.array(RoutineSchema));
}
export function saveRoutine(desc, cronExpr, once) {
    const routines = loadRoutines();
    const routine = { id: uuidv4().slice(0, 8), desc, cronExpr, once };
    routines.push(routine);
    writeFileSync(ROUTINES_FILE, JSON.stringify(routines, null, 2));
    return routine;
}
export function updateRoutine(routine) {
    const routines = loadRoutines();
    const idx = routines.findIndex((r) => r.id === routine.id);
    if (idx !== -1) {
        routines[idx] = routine;
        writeFileSync(ROUTINES_FILE, JSON.stringify(routines, null, 2));
    }
}
export function deleteRoutine(id) {
    const routines = loadRoutines();
    const filtered = routines.filter((r) => r.id !== id);
    if (filtered.length === routines.length)
        return false;
    writeFileSync(ROUTINES_FILE, JSON.stringify(filtered, null, 2));
    return true;
}
// ─── Context ─────────────────────────────────────────────────────────────────
export function loadContext() {
    return safeReadObj(CONTEXT_FILE, ContextSchema, {});
}
export function saveContext(data) {
    ensureDir();
    const ctx = ContextSchema.parse(data);
    writeFileSync(CONTEXT_FILE, JSON.stringify({ ...ctx, updatedAt: new Date().toISOString() }, null, 2));
}
export function clearContext() {
    ensureDir();
    writeFileSync(CONTEXT_FILE, '{}');
}
//# sourceMappingURL=memory.js.map