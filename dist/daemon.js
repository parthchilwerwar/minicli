import chalk from 'chalk';
import { startTelegramBot, stopTelegramBot } from './telegram.js';
import { startMCPServer } from './mcp.js';
import { startWebServer, stopWebServer } from './web-server.js';
import { stopTunnel } from './tunnel.js';
import { startGmailMCP, stopGmailMCP } from './gmail-mcp.js';
import { startAllAgents, stopAllAgents } from './agents/registry.js';
import { startBridgeServer, stopBridgeServer } from './bridge.js';
import { startScheduler } from './routine.js';
import { autoGeneratePersona } from './persona.js';
import { sendToTelegram } from './agents/base.js';
import { graph } from './knowledge-graph.js';
// ─── Config ──────────────────────────────────────────────────────────────────
const LIME = chalk.hex('#b5f300');
const WHITE = chalk.white;
const DIM = chalk.gray;
const BOLD_LIME = chalk.hex('#b5f300').bold;
// ─── ASCII Art ───────────────────────────────────────────────────────────────
const ASCII_ART = `
 ${LIME('███╗   ███╗██╗███╗   ██╗██╗ ██████╗██╗     ██╗')}
 ${LIME('████╗ ████║██║████╗  ██║██║██╔════╝██║     ██║')}
 ${LIME('██╔████╔██║██║██╔██╗ ██║██║██║     ██║     ██║')}
 ${LIME('██║╚██╔╝██║██║██║╚██╗██║██║██║     ██║     ██║')}
 ${LIME('██║ ╚═╝ ██║██║██║ ╚████║██║╚██████╗███████╗██║')}
 ${LIME('╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚══════╝╚═╝')}
`;
// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function printStatus(service, value) {
    const padded = service.padEnd(20);
    process.stdout.write(`  ${LIME('✓')} ${WHITE(padded)}${LIME(value)}\n`);
}
// ─── Daemon ──────────────────────────────────────────────────────────────────
export async function startDaemon() {
    // 1. Clear terminal
    process.stdout.write('\x1Bc');
    // 2. Print ASCII art + slogan
    process.stdout.write(ASCII_ART);
    process.stdout.write(`\n ${DIM('minicli — your life, automated.')}\n`);
    // 3. Divider
    process.stdout.write(`\n ${DIM('─────────────────────────────────────')}\n`);
    process.stdout.write(`  ${DIM('starting...')}\n`);
    process.stdout.write(` ${DIM('─────────────────────────────────────')}\n\n`);
    // 4. Start services with animated ✓ lines
    // Telegram
    await sleep(300);
    let botName = 'minicli';
    try {
        const name = await startTelegramBot();
        botName = name ?? 'minicli';
        printStatus('Telegram', `connected (@${botName})`);
    }
    catch (err) {
        process.stdout.write(`  ${chalk.red('✗')} ${WHITE('Telegram'.padEnd(20))}${chalk.red(err instanceof Error ? err.message : 'failed')}\n`);
    }
    // MCP server
    await sleep(300);
    try {
        const mcpPort = await startMCPServer();
        printStatus('MCP server', `:${mcpPort}`);
    }
    catch (err) {
        process.stdout.write(`  ${chalk.red('✗')} ${WHITE('MCP server'.padEnd(20))}${chalk.red(err instanceof Error ? err.message : 'failed')}\n`);
    }
    // Bridge server (webhooks)
    await sleep(300);
    try {
        await startBridgeServer();
        printStatus('Webhooks', ':6276');
    }
    catch (err) {
        process.stdout.write(`  ${chalk.red('✗')} ${WHITE('Webhooks'.padEnd(20))}${chalk.red(err instanceof Error ? err.message : 'failed')}\n`);
    }
    // Web UI + Cloudflare tunnel
    await sleep(300);
    let publicUrl = 'localhost:7654';
    try {
        const result = await startWebServer();
        publicUrl = result.publicUrl || result.localUrl;
        printStatus('Web UI', ':7654');
        if (publicUrl.includes('trycloudflare.com')) {
            printStatus('Cloudflare', publicUrl);
        }
        else {
            printStatus('Cloudflare', 'fallback to LAN');
        }
    }
    catch (err) {
        process.stdout.write(`  ${chalk.red('✗')} ${WHITE('Web UI'.padEnd(20))}${chalk.red(err instanceof Error ? err.message : 'failed')}\n`);
    }
    // Gmail MCP
    await sleep(300);
    try {
        const gmailStatus = await startGmailMCP();
        printStatus('Gmail MCP', gmailStatus);
    }
    catch {
        printStatus('Gmail MCP', 'not configured');
    }
    // Knowledge graph
    await sleep(300);
    try {
        await graph.load();
        const nodeCount = graph.getNodeCount();
        printStatus('Knowledge graph', `${nodeCount} nodes loaded`);
    }
    catch {
        printStatus('Knowledge graph', 'empty (new)');
    }
    // Queue
    await sleep(200);
    printStatus('Queue', 'ready');
    // Agents
    await sleep(300);
    try {
        await startAllAgents();
    }
    catch { /* best-effort */ }
    printStatus('Supervisor', 'online');
    printStatus('Proactive', 'every 4h');
    printStatus('Agents', 'life-os, dev, trading, opportunity, news');
    printStatus('Memory reviewer', 'sunday midnight');
    // Start cron scheduler
    startScheduler();
    // Auto-generate persona (first run)
    void (async () => {
        try {
            const msg = await autoGeneratePersona();
            if (msg)
                void sendToTelegram(msg);
        }
        catch { /* best-effort */ }
    })();
    // 5. Final status
    process.stdout.write(`\n ${DIM('─────────────────────────────────────')}\n`);
    process.stdout.write(`  ${BOLD_LIME('all systems go. telegram is your interface.')}\n`);
    process.stdout.write(` ${DIM('─────────────────────────────────────')}\n\n`);
    process.stdout.write(`  ${DIM('Press Ctrl+C to stop.')}\n\n`);
    // 6. Store publicUrl globally
    globalThis.__minicliPublicUrl = publicUrl;
    // 7. Clean shutdown
    const shutdown = async () => {
        process.stdout.write(`\n  ${DIM('stopping minicli...')}\n`);
        try {
            await stopAllAgents();
        }
        catch { /* */ }
        try {
            await stopTunnel();
        }
        catch { /* */ }
        try {
            stopWebServer();
        }
        catch { /* */ }
        try {
            stopBridgeServer();
        }
        catch { /* */ }
        try {
            await stopTelegramBot();
        }
        catch { /* */ }
        try {
            await stopGmailMCP();
        }
        catch { /* */ }
        process.stdout.write(`  ${LIME('✓')} ${WHITE('all services stopped. bye.')}\n\n`);
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
}
//# sourceMappingURL=daemon.js.map