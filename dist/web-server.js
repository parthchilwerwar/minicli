import * as http from 'http';
import { generateHtml } from './web-ui.js';
import { getAllMemories, getMemoryById } from './memory-store.js';
import { startCloudflaredTunnel, stopTunnel, getTunnelUrl } from './tunnel.js';
// ─── Config ───────────────────────────────────────────────────────────────────
export function getWebPort() {
    const p = process.env['WEB_PORT'];
    return p ? parseInt(p, 10) : 7654;
}
/**
 * The Web UI exposes raw memories. We bind to loopback only by default so it
 * is reachable only from the same machine. Setting ENABLE_PUBLIC_WEB=true
 * starts a Cloudflare Quick Tunnel; doing so makes every memory readable by
 * anyone who can guess the trycloudflare URL, so it is strictly opt-in.
 */
function publicWebEnabled() {
    return (process.env['ENABLE_PUBLIC_WEB'] ?? '').toLowerCase() === 'true';
}
export function getLanIp() {
    // Web UI is loopback-only. LAN IP kept for legacy callers.
    return '127.0.0.1';
}
// ─── State ────────────────────────────────────────────────────────────────────
let webServer = null;
let publicUrl = null;
// ─── Request handler ─────────────────────────────────────────────────────────
function handleRequest(req, res) {
    const url = req.url ?? '/';
    if (req.method === 'GET' && url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateHtml());
        return;
    }
    if (req.method === 'GET' && url === '/api/memories') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        try {
            const memories = getAllMemories();
            res.end(JSON.stringify(memories));
        }
        catch {
            res.end('[]');
        }
        return;
    }
    const memMatch = url.match(/^\/api\/memory\/(.+)$/);
    if (req.method === 'GET' && memMatch) {
        const id = memMatch[1];
        const mem = id ? getMemoryById(id) : null;
        if (!mem) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
        else {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(mem));
        }
        return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}
// ─── Start (with Cloudflare tunnel) ──────────────────────────────────────────
export function startWebServer() {
    return new Promise((resolve, reject) => {
        if (webServer) {
            resolve({ localUrl: getWebUrl(), publicUrl: publicUrl ?? getWebUrl() });
            return;
        }
        const port = getWebPort();
        webServer = http.createServer(handleRequest);
        webServer.on('error', (err) => {
            reject(new Error(`Web server error: ${err.message}`));
        });
        // Bind to loopback only. The /api/memories endpoint dumps personal
        // conversations, so we never expose it on 0.0.0.0 by default.
        webServer.listen(port, '127.0.0.1', () => {
            const localUrl = getWebUrl();
            if (!publicWebEnabled()) {
                publicUrl = localUrl;
                resolve({ localUrl, publicUrl: localUrl });
                return;
            }
            // Opt-in Cloudflare Quick Tunnel — user explicitly accepts public exposure.
            void startCloudflaredTunnel(port).then((tUrl) => {
                publicUrl = tUrl;
                resolve({ localUrl, publicUrl: tUrl });
            }).catch(() => {
                publicUrl = localUrl;
                resolve({ localUrl, publicUrl: localUrl });
            });
        });
    });
}
// ─── Close tunnel ─────────────────────────────────────────────────────────────
export async function closeTunnel() {
    await stopTunnel();
    publicUrl = null;
}
// ─── Stop server ──────────────────────────────────────────────────────────────
export function stopWebServer() {
    if (webServer) {
        webServer.close();
        webServer = null;
    }
    void closeTunnel();
}
// ─── Getters ──────────────────────────────────────────────────────────────────
export function getWebUrl() {
    return `http://${getLanIp()}:${getWebPort()}`;
}
export function getPublicUrl() {
    return publicUrl ?? getTunnelUrl() ?? getWebUrl();
}
//# sourceMappingURL=web-server.js.map