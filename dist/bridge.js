import * as http from 'http';
import { z } from 'zod';
import { getBridgePort, getBridgeSecret } from './config.js';
import { loadNotes, loadRoutines, loadContext } from './memory.js';
import { runAgent } from './agent.js';
import { ALL_TOOLS } from './tools/registry.js';
// ─── Zod schemas for request bodies ─────────────────────────────────────────
const HistoryMsg = z.object({ role: z.string(), content: z.string() });
const ExecuteBody = z.object({
    message: z.string().min(1),
    history: z.array(HistoryMsg).optional(),
});
const VaultReadBody = z.object({ filename: z.string().min(1) });
const FsReadBody = z.object({ path: z.string().min(1) });
const FsFindBody = z.object({ query: z.string().min(1), searchIn: z.enum(['vault', 'desktop', 'downloads', 'all']).optional() });
// ─── State ───────────────────────────────────────────────────────────────────
let server = null;
// ─── Helpers ─────────────────────────────────────────────────────────────────
function jsonReply(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function errReply(res, code, message) {
    jsonReply(res, code, { error: message, code });
}
function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => { body += String(chunk); });
        req.on('end', () => resolve(body));
    });
}
function parseJson(raw, schema) {
    const parsed = JSON.parse(raw);
    return schema.parse(parsed);
}
// ─── Route handler ───────────────────────────────────────────────────────────
async function handleRoute(req, res) {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    // ── Auth check ──────────────────────────────────────────────────────────
    const secret = getBridgeSecret();
    if (secret && req.headers['x-bridge-secret'] !== secret) {
        errReply(res, 401, 'Unauthorized: invalid or missing X-Bridge-Secret');
        return;
    }
    // ── GET /status ─────────────────────────────────────────────────────────
    if (method === 'GET' && url === '/status') {
        jsonReply(res, 200, {
            status: 'ok',
            pid: process.pid,
            uptime: process.uptime(),
            tools: ALL_TOOLS.map((t) => t.name),
        });
        return;
    }
    // ── GET /notes ──────────────────────────────────────────────────────────
    if (method === 'GET' && url === '/notes') {
        jsonReply(res, 200, { notes: loadNotes().slice(-20) });
        return;
    }
    // ── GET /context ────────────────────────────────────────────────────────
    if (method === 'GET' && url === '/context') {
        jsonReply(res, 200, { context: loadContext() });
        return;
    }
    // ── GET /routines ───────────────────────────────────────────────────────
    if (method === 'GET' && url === '/routines') {
        jsonReply(res, 200, { routines: loadRoutines() });
        return;
    }
    // ── GET /vault/list ─────────────────────────────────────────────────────
    if (method === 'GET' && url === '/vault/list') {
        const tool = ALL_TOOLS.find((t) => t.name === 'vault_list');
        if (!tool) {
            errReply(res, 500, 'vault_list tool not found');
            return;
        }
        const result = await tool.execute({});
        jsonReply(res, 200, { result });
        return;
    }
    // ── POST /vault/read ────────────────────────────────────────────────────
    if (method === 'POST' && url === '/vault/read') {
        const raw = await readBody(req);
        const body = parseJson(raw, VaultReadBody);
        const tool = ALL_TOOLS.find((t) => t.name === 'vault_read');
        if (!tool) {
            errReply(res, 500, 'vault_read tool not found');
            return;
        }
        const result = await tool.execute({ filename: body.filename });
        jsonReply(res, 200, { result });
        return;
    }
    // ── GET /fs/list ────────────────────────────────────────────────────────
    if (method === 'GET' && url?.startsWith('/fs/list')) {
        const params = new URL(url, 'http://localhost').searchParams;
        const path = params.get('path') ?? '';
        if (!path) {
            errReply(res, 400, 'Missing path parameter');
            return;
        }
        const tool = ALL_TOOLS.find((t) => t.name === 'fs_list_dir');
        if (!tool) {
            errReply(res, 500, 'fs_list_dir tool not found');
            return;
        }
        const result = await tool.execute({ path });
        jsonReply(res, 200, { result });
        return;
    }
    // ── POST /fs/read ───────────────────────────────────────────────────────
    if (method === 'POST' && url === '/fs/read') {
        const raw = await readBody(req);
        const body = parseJson(raw, FsReadBody);
        const tool = ALL_TOOLS.find((t) => t.name === 'fs_read_file');
        if (!tool) {
            errReply(res, 500, 'fs_read_file tool not found');
            return;
        }
        const result = await tool.execute({ path: body.path });
        jsonReply(res, 200, { result });
        return;
    }
    // ── POST /fs/find ───────────────────────────────────────────────────────
    if (method === 'POST' && url === '/fs/find') {
        const raw = await readBody(req);
        const body = parseJson(raw, FsFindBody);
        const tool = ALL_TOOLS.find((t) => t.name === 'fs_find');
        if (!tool) {
            errReply(res, 500, 'fs_find tool not found');
            return;
        }
        const result = await tool.execute({ query: body.query, searchIn: body.searchIn });
        jsonReply(res, 200, { result });
        return;
    }
    // ── POST /execute (agent loop) ──────────────────────────────────────────
    if (method === 'POST' && url === '/execute') {
        const raw = await readBody(req);
        const body = parseJson(raw, ExecuteBody);
        const notesCtx = loadNotes().slice(-5).map((n) => `[note] ${n.text}`).join('\n');
        // Inject tasks due today and tomorrow so the LLM can answer task queries
        const { getTasksByDate } = await import('./memory-store.js');
        const todayStr = new Date().toISOString().slice(0, 10);
        const tmrDate = new Date();
        tmrDate.setDate(tmrDate.getDate() + 1);
        const tomorrowStr = tmrDate.toISOString().slice(0, 10);
        const todayTasks = getTasksByDate(todayStr);
        const tmrTasks = getTasksByDate(tomorrowStr);
        const taskCtx = [
            todayTasks.length ? `Tasks due today (${todayStr}):\n${todayTasks.map((t) => `- ${t.messages[0]?.content ?? t.title}`).join('\n')}` : '',
            tmrTasks.length ? `Tasks due tomorrow (${tomorrowStr}):\n${tmrTasks.map((t) => `- ${t.messages[0]?.content ?? t.title}`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n');
        const system = {
            role: 'system',
            content: `You are minicli, a personal AI assistant for Parth, with access to filesystem, vault, notes, and tools.\nUser notes:\n${notesCtx || 'none'}${taskCtx ? `\n\n${taskCtx}` : ''}\n\nIMPORTANT: You have full conversation history. Always use prior context to answer follow-up questions. If a file was previously found, remember its path.`,
        };
        // Build message history: system + prior turns + current message
        const priorMsgs = (body.history ?? []).map((m) => ({
            role: m.role,
            content: m.content,
        }));
        const result = await runAgent(body.message, ALL_TOOLS, [system, ...priorMsgs], false);
        jsonReply(res, 200, { result });
        return;
    }
    errReply(res, 404, 'Not found');
}
// ─── Request wrapper ─────────────────────────────────────────────────────────
function handleRequest(req, res) {
    res.setHeader('Content-Type', 'application/json');
    void (async () => {
        try {
            await handleRoute(req, res);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errReply(res, 500, msg);
        }
    })();
}
// ─── Start / Stop ────────────────────────────────────────────────────────────
export function startBridgeServer() {
    return new Promise((resolve, reject) => {
        const port = getBridgePort();
        server = http.createServer(handleRequest);
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE')
                reject(new Error(`Bridge port ${port} already in use`));
            else
                reject(err);
        });
        server.listen(port, '127.0.0.1', () => resolve());
    });
}
export function stopBridgeServer() {
    if (server) {
        server.close();
        server = null;
    }
}
//# sourceMappingURL=bridge.js.map