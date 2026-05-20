import * as http from 'http';
import { networkInterfaces } from 'os';
import { generateHtml } from './web-ui.js';
import { getAllMemories, getMemoryById } from './memory-store.js';
import { startCloudflaredTunnel, stopTunnel, getTunnelUrl } from './tunnel.js';

// ─── Config ───────────────────────────────────────────────────────────────────

export function getWebPort(): number {
  const p = process.env['WEB_PORT'];
  return p ? parseInt(p, 10) : 7654;
}

export function getLanIp(): string {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

// ─── State ────────────────────────────────────────────────────────────────────

let webServer: http.Server | null = null;
let publicUrl: string | null = null;

// ─── Request handler ─────────────────────────────────────────────────────────

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
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
    } catch {
      res.end('[]');
    }
    return;
  }

  const memMatch = url.match(/^\/api\/memory\/(.+)$/);
  if (req.method === 'GET' && memMatch) {
    const id  = memMatch[1];
    const mem = id ? getMemoryById(id) : null;
    if (!mem) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(mem));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ─── Start (with Cloudflare tunnel) ──────────────────────────────────────────

export function startWebServer(): Promise<{ localUrl: string; publicUrl: string }> {
  return new Promise((resolve, reject) => {
    if (webServer) {
      resolve({ localUrl: getWebUrl(), publicUrl: publicUrl ?? getWebUrl() });
      return;
    }

    const port = getWebPort();
    webServer  = http.createServer(handleRequest);

    webServer.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(`Web server error: ${err.message}`));
    });

    webServer.listen(port, '0.0.0.0', () => {
      const localUrl = getWebUrl();

      // Attempt Cloudflare Quick Tunnel
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

export async function closeTunnel(): Promise<void> {
  await stopTunnel();
  publicUrl = null;
}

// ─── Stop server ──────────────────────────────────────────────────────────────

export function stopWebServer(): void {
  if (webServer) { webServer.close(); webServer = null; }
  void closeTunnel();
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getWebUrl(): string {
  return `http://${getLanIp()}:${getWebPort()}`;
}

export function getPublicUrl(): string {
  return publicUrl ?? getTunnelUrl() ?? getWebUrl();
}
