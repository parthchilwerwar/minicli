import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ALL_TOOLS } from './tools/registry.js';
import { getMcpPort, CONFIG_DIR } from './config.js';
const PID_FILE = path.join(CONFIG_DIR, 'daemon.pid');
// ─── PID helpers ─────────────────────────────────────────────────────────────
function writePid(pid) {
    fs.writeFileSync(PID_FILE, String(pid));
}
function readPid() {
    if (!fs.existsSync(PID_FILE))
        return null;
    const n = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    return isNaN(n) ? null : n;
}
function deletePid() {
    if (fs.existsSync(PID_FILE))
        fs.unlinkSync(PID_FILE);
}
// ─── Daemon ping / stop ───────────────────────────────────────────────────────
export async function pingDaemon() {
    const port = getMcpPort();
    try {
        const res = await fetch(`http://127.0.0.1:${port}/ping`);
        return res.ok;
    }
    catch {
        return false;
    }
}
export function stopDaemon() {
    const pid = readPid();
    if (!pid)
        return false;
    try {
        process.kill(pid, 'SIGTERM');
        deletePid();
        return true;
    }
    catch {
        deletePid(); // stale PID — clean up anyway
        return false;
    }
}
// ─── MCP discovery manifest ───────────────────────────────────────────────────
function buildManifest() {
    return {
        name: 'minicli',
        version: '1.0.0',
        tools: ALL_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: { type: 'object' }, // tools expose Zod; keep it simple for discovery
        })),
    };
}
// ─── Request handler ─────────────────────────────────────────────────────────
function handleRequest(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // MCP discovery
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200);
        res.end(JSON.stringify(buildManifest(), null, 2));
        return;
    }
    // Health check
    if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', pid: process.pid }));
        return;
    }
    // JSON-RPC endpoint
    if (req.method === 'POST' && req.url === '/rpc') {
        let body = '';
        req.on('data', (chunk) => { body += String(chunk); });
        req.on('end', () => {
            void (async () => {
                let rpcId = null;
                try {
                    const payload = JSON.parse(body);
                    rpcId = payload.id;
                    if (payload.jsonrpc !== '2.0')
                        throw new Error('Invalid JSON-RPC version');
                    let result;
                    if (payload.method === 'tools/list') {
                        result = { tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description })) };
                    }
                    else if (payload.method === 'tools/call') {
                        const p = payload.params;
                        if (!p?.name)
                            throw new Error('Missing tool name');
                        const tool = ALL_TOOLS.find((t) => t.name === p.name);
                        if (!tool)
                            throw new Error(`Tool not found: ${p.name}`);
                        const output = await tool.execute(p.arguments ?? {});
                        result = { content: [{ type: 'text', text: output }] };
                    }
                    else {
                        throw new Error(`Method not found: ${payload.method}`);
                    }
                    res.writeHead(200);
                    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpcId, result }));
                }
                catch (err) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        jsonrpc: '2.0', id: rpcId,
                        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
                    }));
                }
            })();
        });
        return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
}
// ─── Start MCP server (called from daemon.ts) ────────────────────────────────
export function startMCPServer() {
    return new Promise((resolve, reject) => {
        const port = getMcpPort();
        const server = http.createServer(handleRequest);
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                reject(new Error(`Port ${port} already in use`));
            }
            else {
                reject(err);
            }
        });
        server.listen(port, '127.0.0.1', () => {
            writePid(process.pid);
            resolve(port);
        });
    });
}
//# sourceMappingURL=mcp.js.map