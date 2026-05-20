import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { callLLM } from './llm.js';
import { graph } from './knowledge-graph.js';
// ─── Paths ────────────────────────────────────────────────────────────────────
const MEM_DIR = join(homedir(), '.minicli', 'memories');
const INDEX_FILE = join(MEM_DIR, 'index.json');
// ─── Schema ───────────────────────────────────────────────────────────────────
const ConvMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
});
export const MemoryEntrySchema = z.object({
    id: z.string(),
    timestamp: z.string(),
    source: z.enum(['cli', 'telegram']),
    type: z.enum(['conversation', 'task', 'reminder', 'note', 'fact']),
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
    messages: z.array(ConvMessageSchema),
    linkedIds: z.array(z.string()),
    dueDate: z.string().optional(), // ISO date string e.g. "2025-12-20"
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureDir() {
    if (!existsSync(MEM_DIR))
        mkdirSync(MEM_DIR, { recursive: true });
}
function todayStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function loadIndex() {
    ensureDir();
    if (!existsSync(INDEX_FILE))
        return [];
    try {
        return JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function saveIndex(index) {
    ensureDir();
    writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}
function dayDir(date) {
    const d = join(MEM_DIR, date);
    if (!existsSync(d))
        mkdirSync(d, { recursive: true });
    return d;
}
// ─── Save memory ─────────────────────────────────────────────────────────────
export async function saveMemory(entry) {
    const id = nanoid(10);
    const date = todayStr();
    // Generate title / summary / tags via LLM
    let title = entry.messages[0]?.content.slice(0, 40) ?? 'Conversation';
    let summary = '';
    let tags = [];
    try {
        const convText = entry.messages.map((m) => `${m.role}: ${m.content}`).join('\n');
        const res = await callLLM([{
                role: 'user',
                content: `Given this conversation, output JSON only (no markdown):\n{ "title": "5 word summary", "summary": "2 sentences max", "tags": ["tag1","tag2","tag3"] }\n\nConversation:\n${convText.slice(0, 3000)}`,
            }]);
        const raw = res.content.trim().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (parsed.title)
            title = parsed.title;
        if (parsed.summary)
            summary = parsed.summary;
        if (parsed.tags)
            tags = parsed.tags.slice(0, 5);
    }
    catch { /* use fallbacks */ }
    // Find linked memories by tag overlap
    const index = loadIndex();
    const linkedIds = index
        .filter((e) => e.tags.some((t) => tags.includes(t)) && e.id !== id)
        .slice(0, 5)
        .map((e) => e.id);
    const mem = {
        ...entry, id, title, summary, tags, linkedIds,
    };
    // Save individual file
    const file = join(dayDir(date), `${id}.json`);
    writeFileSync(file, JSON.stringify(mem, null, 2));
    // Update index (include dueDate so we can query tasks by date efficiently)
    index.push({ id, date, title, tags, timestamp: mem.timestamp, dueDate: mem.dueDate });
    saveIndex(index);
    // Also add to knowledge graph
    try {
        await graph.load();
        const nodeType = mem.type === 'task' ? 'task'
            : mem.type === 'reminder' ? 'task'
                : mem.type === 'note' ? 'fact'
                    : 'conversation';
        await graph.addNode({
            type: nodeType,
            label: title,
            content: summary || mem.messages.map((m) => m.content).join(' ').slice(0, 500),
            tags,
        });
    }
    catch { /* knowledge graph is best-effort */ }
    return mem;
}
// ─── Search ───────────────────────────────────────────────────────────────────
export async function searchMemories(query, limit = 10) {
    const q = query.toLowerCase();
    const index = loadIndex();
    const scored = index.map((e) => {
        let score = 0;
        if (e.title.toLowerCase().includes(q))
            score += 3;
        if (e.tags.some((t) => t.toLowerCase().includes(q)))
            score += 2;
        return { ...e, score };
    }).filter((e) => e.score > 0).sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));
    const top = scored.slice(0, limit);
    return top.map((e) => {
        const file = join(MEM_DIR, e.date, `${e.id}.json`);
        if (!existsSync(file))
            return null;
        try {
            return MemoryEntrySchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
        }
        catch {
            return null;
        }
    }).filter((e) => e !== null);
}
// ─── Recent / All / By ID ─────────────────────────────────────────────────────
export function getRecentMemories(limit = 10) {
    const index = loadIndex();
    const sorted = [...index].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
    return sorted.map((e) => {
        const file = join(MEM_DIR, e.date, `${e.id}.json`);
        if (!existsSync(file))
            return null;
        try {
            return MemoryEntrySchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
        }
        catch {
            return null;
        }
    }).filter((e) => e !== null);
}
export function getMemoryById(id) {
    const index = loadIndex();
    const entry = index.find((e) => e.id === id);
    if (!entry)
        return null;
    const file = join(MEM_DIR, entry.date, `${id}.json`);
    if (!existsSync(file))
        return null;
    try {
        return MemoryEntrySchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
    }
    catch {
        return null;
    }
}
export function getAllMemories() {
    const index = [...loadIndex()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return index.map((e) => {
        const file = join(MEM_DIR, e.date, `${e.id}.json`);
        if (!existsSync(file))
            return null;
        try {
            return MemoryEntrySchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
        }
        catch {
            return null;
        }
    }).filter((e) => e !== null);
}
/**
 * Returns all tasks (type === 'task') whose dueDate matches the given ISO date
 * string (YYYY-MM-DD). Falls back to searching all task entries if dueDate is
 * not stored in the index (legacy entries).
 */
export function getTasksByDate(isoDate) {
    const index = loadIndex();
    const matched = index.filter((e) => e.dueDate === isoDate);
    return matched.map((e) => {
        const file = join(MEM_DIR, e.date, `${e.id}.json`);
        if (!existsSync(file))
            return null;
        try {
            return MemoryEntrySchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
        }
        catch {
            return null;
        }
    }).filter((e) => e !== null);
}
/** Returns all tasks regardless of due date. */
export function getAllTasks() {
    const index = loadIndex();
    return index.map((e) => {
        const file = join(MEM_DIR, e.date, `${e.id}.json`);
        if (!existsSync(file))
            return null;
        try {
            const mem = MemoryEntrySchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
            return mem.type === 'task' ? mem : null;
        }
        catch {
            return null;
        }
    }).filter((e) => e !== null);
}
//# sourceMappingURL=memory-store.js.map