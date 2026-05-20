import { spawn } from 'child_process';
// ─── State ───────────────────────────────────────────────────────────────────
let tunnelProcess = null;
let publicUrl = null;
// ─── Start Cloudflare Quick Tunnel ───────────────────────────────────────────
export async function startCloudflaredTunnel(port) {
    return new Promise((resolve, reject) => {
        tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const timeout = setTimeout(() => {
            reject(new Error('Cloudflare tunnel timeout — is cloudflared installed?'));
        }, 15000);
        const handleOutput = (data) => {
            const line = data.toString();
            const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match?.[0]) {
                clearTimeout(timeout);
                publicUrl = match[0];
                resolve(publicUrl);
            }
        };
        tunnelProcess.stdout?.on('data', handleOutput);
        tunnelProcess.stderr?.on('data', handleOutput); // cloudflared logs to stderr
        tunnelProcess.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`cloudflared spawn error: ${err.message}`));
        });
        tunnelProcess.on('exit', (code) => {
            if (!publicUrl) {
                clearTimeout(timeout);
                reject(new Error(`cloudflared exited with code ${String(code)} before URL was found`));
            }
        });
    });
}
// ─── Stop Tunnel ─────────────────────────────────────────────────────────────
export async function stopTunnel() {
    if (tunnelProcess) {
        tunnelProcess.kill();
        tunnelProcess = null;
    }
    publicUrl = null;
}
// ─── Get URL ─────────────────────────────────────────────────────────────────
export function getTunnelUrl() {
    return publicUrl;
}
//# sourceMappingURL=tunnel.js.map