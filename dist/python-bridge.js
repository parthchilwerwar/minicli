/**
 * Python Agent Server bridge — spawns and manages the FastAPI server.
 */
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
let pythonProcess = null;
export async function startPythonServer() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pythonDir = resolve(__dirname, '../python');
    pythonProcess = spawn('python', [
        '-m', 'uvicorn', 'server:app',
        '--host', '127.0.0.1',
        '--port', '6280',
        '--log-level', 'warning',
    ], {
        cwd: pythonDir,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    pythonProcess.stdout?.on('data', (data) => {
        const line = data.toString().trim();
        if (line)
            console.log(`  [py] ${line}`);
    });
    pythonProcess.stderr?.on('data', (data) => {
        const line = data.toString().trim();
        // Filter out uvicorn INFO spam
        if (line && !line.includes('INFO:'))
            console.error(`  [py] ${line}`);
    });
    pythonProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`  [py] Agent server exited with code ${code}`);
        }
    });
    // Wait for health check — up to 120s for first run (model download)
    const maxWait = 120_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const res = await fetch('http://127.0.0.1:6280/health');
            if (res.ok)
                return;
        }
        catch {
            // Not ready yet
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error('Python agent server failed to start within 120s');
}
export function stopPythonServer() {
    if (pythonProcess) {
        pythonProcess.kill('SIGTERM');
        pythonProcess = null;
    }
}
export async function callPythonAgent(message, chatId, history = []) {
    try {
        const res = await fetch('http://127.0.0.1:6280/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, chat_id: chatId, history }),
        });
        const data = (await res.json());
        if (!res.ok)
            return `❌ Agent error: ${data.detail ?? data.error ?? 'unknown'}`;
        return data.result ?? 'No response from agent.';
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `❌ Agent server unreachable: ${msg}`;
    }
}
//# sourceMappingURL=python-bridge.js.map