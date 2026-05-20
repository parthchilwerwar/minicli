import TelegramBot from 'node-telegram-bot-api';
import { getBridgePort, getBridgeSecret, getVaultPath, getDesktopPath, getDownloadsPath } from './config.js';
import { loadNotes, loadRoutines, loadContext } from './memory.js';
import { doDashboardText } from './dashboard.js';
import { saveMemory, searchMemories, getRecentMemories, getTasksByDate, getAllTasks } from './memory-store.js';
import { updateUserProfile, loadUserMd } from './persona.js';
import { getPublicUrl } from './web-server.js';
import { setBotRef } from './agents/base.js';
import { lifeOsAgent, tradingAgent, oppContentAgent } from './agents/registry.js';
import { routeToSubAgent } from './agents/sub-agent-router.js';
import { isGmailConnected } from './gmail-mcp.js';
import { messageQueue } from './queue.js';
import { asyncTasks } from './async-tasks.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, resolve } from 'path';
// ─── State ───────────────────────────────────────────────────────────────────
let bot = null;
const chatHistory = new Map();
const HISTORY_MAX = 20;
const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.csv', '.log', '.ts', '.js', '.py', '.sh', '.yaml', '.yml', '.toml', '.env']);
function getHistory(chatId) {
    if (!chatHistory.has(chatId))
        chatHistory.set(chatId, []);
    return chatHistory.get(chatId);
}
function appendHistory(chatId, role, content) {
    const h = getHistory(chatId);
    h.push({ role, content });
    if (h.length > HISTORY_MAX)
        h.splice(0, h.length - HISTORY_MAX);
}
// ─── Clean Response ──────────────────────────────────────────────────────────
function cleanResponse(text) {
    return text
        // Remove markdown bold/italic symbols
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        // Remove markdown headers
        .replace(/#{1,6}\s/g, '')
        // Remove markdown horizontal rules
        .replace(/---+/g, '─────')
        // Remove backtick code blocks (keep content, remove backticks)
        .replace(/```[\w]*\n?/g, '')
        .replace(/`([^`]+)`/g, '$1')
        // Remove leading slash from lines (except telegram commands)
        .replace(/^\/(?!start|help|today|tasks|web|gmail|memory|search|persona|news|market)/gm, '')
        // Clean multiple blank lines → single blank line
        .replace(/\n{3,}/g, '\n\n')
        // Trim
        .trim();
}
// ─── File detection helper ───────────────────────────────────────────────────
async function tryReadAndSendFile(chatId, response) {
    const pathPattern = /`([^`]+\.[a-z]+)`|(?:found|file)[:\s]+([\w ./\\-]+\.[a-z]+)/gi;
    let match;
    const candidates = [];
    while ((match = pathPattern.exec(response)) !== null) {
        const cand = (match[1] ?? match[2] ?? '').trim();
        if (cand && TEXT_EXTS.has(extname(cand).toLowerCase()))
            candidates.push(cand);
    }
    if (!candidates.length)
        return;
    const roots = [getDesktopPath(), getDownloadsPath(), getVaultPath()].filter(Boolean);
    for (const name of candidates) {
        if (existsSync(name) && TEXT_EXTS.has(extname(name).toLowerCase())) {
            const content = await readFile(name, 'utf-8');
            await bot?.sendMessage(chatId, `📄 ${name}\n\n${content.slice(0, 3800)}`)
                .catch(() => { });
            return;
        }
        for (const root of roots) {
            const full = resolve(root, name);
            if (existsSync(full) && TEXT_EXTS.has(extname(full).toLowerCase())) {
                const content = await readFile(full, 'utf-8');
                await bot?.sendMessage(chatId, `📄 ${name}\n\n${content.slice(0, 3800)}`)
                    .catch(() => { });
                return;
            }
        }
    }
}
// ─── Task-query helper ───────────────────────────────────────────────────────
function handleTaskQuery(message) {
    const lc = message.toLowerCase();
    const isTaskQuery = (lc.includes('task') || lc.includes('due') || lc.includes('todo')) &&
        (lc.includes('today') || lc.includes('tomorrow') || lc.includes('any') || lc.includes('what') || lc.includes('show') || lc.includes('list'));
    if (!isTaskQuery)
        return null;
    const pad = (n) => String(n).padStart(2, '0');
    const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const todayStr = localDate(today);
    const tomorrowStr = localDate(tomorrow);
    const wantsTomorrow = lc.includes('tomorrow');
    const wantsToday = lc.includes('today') || (!wantsTomorrow && lc.includes('any'));
    const wantsAll = !wantsToday && !wantsTomorrow;
    const tasks = wantsTomorrow ? getTasksByDate(tomorrowStr) : wantsToday ? getTasksByDate(todayStr) : getAllTasks();
    if (!tasks.length) {
        const when = wantsTomorrow ? `tomorrow (${tomorrowStr})` : wantsToday ? `today (${todayStr})` : 'any day';
        if (wantsAll)
            return null;
        return `📋 No tasks due ${when}.`;
    }
    const header = wantsTomorrow ? `📋 Tasks due tomorrow (${tomorrowStr})` : wantsToday ? `📋 Tasks due today (${todayStr})` : `📋 All tasks (${tasks.length})`;
    const lines = tasks.slice(0, 15).map((t, i) => {
        const due = t.dueDate ? ` · Due: ${t.dueDate}` : '';
        const content = t.messages[0]?.content ?? t.title;
        return `${i + 1}. ${content.slice(0, 80)}${due}`;
    });
    return `${header}\n\n${lines.join('\n')}`;
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getAllowedUserId() {
    const id = process.env['TELEGRAM_ALLOWED_USER_ID'] ?? '';
    if (!id)
        throw new Error('TELEGRAM_ALLOWED_USER_ID not set');
    return parseInt(id, 10);
}
function splitMessage(text, maxLen = 4000) {
    if (text.length <= maxLen)
        return [text];
    const parts = [];
    let remaining = text;
    while (remaining.length > 0) {
        let chunk = remaining.slice(0, maxLen);
        if (remaining.length > maxLen) {
            const nl = chunk.lastIndexOf('\n');
            if (nl > maxLen * 0.5)
                chunk = chunk.slice(0, nl);
        }
        parts.push(chunk);
        remaining = remaining.slice(chunk.length);
    }
    return parts;
}
async function bridgeCall(method, path, body) {
    const port = getBridgePort();
    const secret = getBridgeSecret();
    const url = `http://127.0.0.1:${port}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (secret)
        headers['X-Bridge-Secret'] = secret;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok)
        return `❌ Error: ${String(data['error'] ?? 'unknown')}`;
    return String(data['result'] ?? JSON.stringify(data, null, 2));
}
async function sendResult(chatId, thinkingId, text) {
    const cleaned = cleanResponse(text || 'Done.');
    const parts = splitMessage(cleaned);
    try {
        await bot?.editMessageText(parts[0] ?? 'Done.', { chat_id: chatId, message_id: thinkingId });
    }
    catch {
        await bot?.sendMessage(chatId, parts[0] ?? 'Done.');
    }
    for (let i = 1; i < parts.length; i++)
        await bot?.sendMessage(chatId, parts[i] ?? '');
}
// ─── URL detection helper ────────────────────────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s<>]+/i;
// ─── Content command detection ───────────────────────────────────────────────
function detectContentCmd(text) {
    const lc = text.toLowerCase();
    if (lc.startsWith('tweet this:'))
        return { type: 'tweet', topic: text.slice(11).trim() };
    if (lc.startsWith('linkedin post about'))
        return { type: 'linkedin', topic: text.slice(19).trim() };
    if (lc.startsWith('readme for'))
        return { type: 'readme', topic: text.slice(10).trim() };
    if (lc.startsWith('announcement for'))
        return { type: 'announcement', topic: text.slice(16).trim() };
    return null;
}
// ─── Bot ─────────────────────────────────────────────────────────────────────
export async function startTelegramBot() {
    const token = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
    if (!token)
        return null;
    const allowedId = getAllowedUserId();
    bot = new TelegramBot(token, { polling: true });
    setBotRef(bot, allowedId);
    function isAllowed(msg) { return msg.from?.id === allowedId; }
    const USER_NAME = process.env['LIFE_OS_NAME'] ?? 'Parth';
    let botName = 'minicli';
    try {
        const me = await bot.getMe();
        botName = me.username ?? 'minicli';
    }
    catch { /* ignore */ }
    await bot.setMyCommands([
        { command: 'start', description: '🤖 Welcome' }, { command: 'today', description: '📅 Dashboard' },
        { command: 'notes', description: '📝 Notes' }, { command: 'vault', description: '🗂️ Vault' },
        { command: 'desktop', description: '🖥️ Desktop' }, { command: 'downloads', description: '📥 Downloads' },
        { command: 'find', description: '🔍 Find file' }, { command: 'read', description: '📄 Read note' },
        { command: 'context', description: '🧠 Context' }, { command: 'routines', description: '📅 Routines' },
        { command: 'memory', description: '💾 Memories' }, { command: 'search', description: '🔎 Search' },
        { command: 'web', description: '🌐 Web UI' }, { command: 'persona', description: '🎭 Profile' },
        { command: 'gmail', description: '📧 Gmail' }, { command: 'news', description: '📰 News' },
        { command: 'tasks', description: '📋 Background tasks' },
        { command: 'status', description: '⚡ Status' }, { command: 'help', description: '❓ Help' },
    ]).catch(() => { });
    // ── /tasks
    bot.onText(/\/tasks(?:\s+(.+))?/, (msg, match) => {
        if (!isAllowed(msg))
            return;
        const sub = match?.[1]?.trim() ?? 'active';
        if (sub === 'active' || sub === '') {
            void bot?.sendMessage(msg.chat.id, asyncTasks.formatActive());
        }
        else {
            void bot?.sendMessage(msg.chat.id, asyncTasks.formatActive());
        }
    });
    // ── /start
    bot.onText(/\/start/, (msg) => {
        if (!isAllowed(msg))
            return;
        void bot?.sendMessage(msg.chat.id, `hey ${USER_NAME}! i'm minicli, your personal agent.\n\n` +
            `running agents:\n  🌅 Life OS — tasks, habits, briefs\n  💻 Dev & Builder — GitHub, bounty\n  📈 Trading+Research — markets, research\n  🎯 Opportunity+Content — opportunities, content\n\nuse /help for commands.`)
            .catch(() => { });
    });
    // ── /help
    bot.onText(/\/help/, (msg) => {
        if (!isAllowed(msg))
            return;
        void bot?.sendMessage(msg.chat.id, [
            'Commands', '/today — dashboard', '/notes — notes', '/vault — vault tree',
            '/memory — memories', '/search <q> — search', '/web — web UI', '/persona — profile',
            '/gmail — email', '/news — news feed',
            '/status — daemon', '', '💬 or just type naturally — i\'m listening.',
        ].join('\n')).catch(() => { });
    });
    // ── /today
    bot.onText(/\/today/, (msg) => {
        if (!isAllowed(msg))
            return;
        void (async () => {
            const t = await bot?.sendMessage(msg.chat.id, '⏳ Building dashboard...');
            try {
                const dash = await doDashboardText();
                if (t)
                    await sendResult(msg.chat.id, t.message_id, `📅 Today\n\n${dash}`);
            }
            catch {
                if (t)
                    await bot?.editMessageText('❌ Failed.', { chat_id: msg.chat.id, message_id: t.message_id });
            }
        })();
    });
    // ── /notes
    bot.onText(/\/notes/, (msg) => {
        if (!isAllowed(msg))
            return;
        const notes = loadNotes().slice(-5).reverse();
        if (!notes.length) {
            void bot?.sendMessage(msg.chat.id, '📝 No notes.');
            return;
        }
        void bot?.sendMessage(msg.chat.id, cleanResponse(notes.map((n) => `📝 ${n.text.slice(0, 100)}\n   ${n.tags.map((t) => `#${t}`).join(' ')}`).join('\n\n')));
    });
    // ── /vault
    bot.onText(/\/vault/, (msg) => {
        if (!isAllowed(msg))
            return;
        void (async () => { const t = await bot?.sendMessage(msg.chat.id, '⏳...'); try {
            const r = await bridgeCall('GET', '/vault/list');
            if (t)
                await sendResult(msg.chat.id, t.message_id, `🗂️ Vault\n\n${r}`);
        }
        catch {
            if (t)
                await bot?.editMessageText('❌', { chat_id: msg.chat.id, message_id: t.message_id });
        } })();
    });
    // ── /desktop /downloads
    bot.onText(/\/desktop/, (msg) => { if (!isAllowed(msg))
        return; const dp = getDesktopPath(); if (!dp) {
        void bot?.sendMessage(msg.chat.id, '❌ Not configured.');
        return;
    } void (async () => { const t = await bot?.sendMessage(msg.chat.id, '⏳...'); try {
        const r = await bridgeCall('GET', `/fs/list?path=${encodeURIComponent(dp)}`);
        if (t)
            await sendResult(msg.chat.id, t.message_id, `🖥️\n${r}`);
    }
    catch { /**/ } })(); });
    bot.onText(/\/downloads/, (msg) => { if (!isAllowed(msg))
        return; const dp = getDownloadsPath(); if (!dp) {
        void bot?.sendMessage(msg.chat.id, '❌ Not configured.');
        return;
    } void (async () => { const t = await bot?.sendMessage(msg.chat.id, '⏳...'); try {
        const r = await bridgeCall('GET', `/fs/list?path=${encodeURIComponent(dp)}`);
        if (t)
            await sendResult(msg.chat.id, t.message_id, `📥\n${r}`);
    }
    catch { /**/ } })(); });
    // ── /find /read
    bot.onText(/\/find (.+)/, (msg, match) => { if (!isAllowed(msg))
        return; const q = match?.[1]?.trim() ?? ''; void (async () => { const t = await bot?.sendMessage(msg.chat.id, '⏳...'); try {
        const r = await bridgeCall('POST', '/fs/find', { query: q, searchIn: 'all' });
        if (t)
            await sendResult(msg.chat.id, t.message_id, `🔍 "${q}"\n${r}`);
    }
    catch { /**/ } })(); });
    bot.onText(/\/read (.+)/, (msg, match) => { if (!isAllowed(msg))
        return; const f = match?.[1]?.trim() ?? ''; void (async () => { const t = await bot?.sendMessage(msg.chat.id, '⏳...'); try {
        const r = await bridgeCall('POST', '/vault/read', { filename: f });
        if (t)
            await sendResult(msg.chat.id, t.message_id, `📄 ${f}\n\n${r.slice(0, 3800)}`);
    }
    catch { /**/ } })(); });
    // ── /context /routines /status
    bot.onText(/\/context/, (msg) => { if (!isAllowed(msg))
        return; const ctx = loadContext(); const lines = ['🧠 Personal Context\n']; if (ctx.name)
        lines.push(`Name: ${ctx.name}`); if (ctx.goals)
        lines.push(`Goals: ${Array.isArray(ctx.goals) ? ctx.goals.join(', ') : ctx.goals}`); void bot?.sendMessage(msg.chat.id, lines.join('\n')).catch(() => { }); });
    bot.onText(/\/routines/, (msg) => { if (!isAllowed(msg))
        return; const r = loadRoutines(); void bot?.sendMessage(msg.chat.id, r.length ? r.map((x) => `📅 ${x.desc}\n   ${x.cronExpr ?? 'manual'}`).join('\n\n') : '📅 No routines.'); });
    bot.onText(/\/status/, (msg) => { if (!isAllowed(msg))
        return; void (async () => { try {
        const r = await bridgeCall('GET', '/status');
        void bot?.sendMessage(msg.chat.id, `⚡ Status\n${r}`);
    }
    catch {
        void bot?.sendMessage(msg.chat.id, '❌ Offline.');
    } })(); });
    // ── /memory /search /web /persona
    bot.onText(/\/memory/, (msg) => { if (!isAllowed(msg))
        return; const mems = getRecentMemories(5); if (!mems.length) {
        void bot?.sendMessage(msg.chat.id, '💾 No memories.');
        return;
    } const text = '💾 Recent\n\n' + mems.map((m, i) => `${i + 1}. ${m.title}\n   ${m.type} · ${new Date(m.timestamp).toLocaleDateString()}`).join('\n\n'); void bot?.sendMessage(msg.chat.id, text).catch(() => { }); });
    bot.onText(/\/search (.+)/, (msg, match) => { if (!isAllowed(msg))
        return; const q = match?.[1]?.trim() ?? ''; void (async () => { const t = await bot?.sendMessage(msg.chat.id, '⏳...'); try {
        const results = await searchMemories(q, 3);
        if (!results.length) {
            if (t)
                await sendResult(msg.chat.id, t.message_id, `🔎 No results for "${q}"`);
            return;
        }
        const text = results.map((m, i) => `${i + 1}. ${m.title}\n   ${m.summary}\n   ${m.type}`).join('\n\n');
        if (t)
            await sendResult(msg.chat.id, t.message_id, `🔎 "${q}"\n\n${text}`);
    }
    catch { /**/ } })(); });
    bot.onText(/\/web/, (msg) => {
        if (!isAllowed(msg))
            return;
        try {
            const url = globalThis.__minicliPublicUrl ?? getPublicUrl();
            void bot?.sendMessage(msg.chat.id, `🌐 ${url}`);
        }
        catch {
            void bot?.sendMessage(msg.chat.id, '❌ Web server not started.');
        }
    });
    bot.onText(/\/persona/, (msg) => { if (!isAllowed(msg))
        return; const md = loadUserMd(); void bot?.sendMessage(msg.chat.id, cleanResponse(`🎭 USER.md\n\n${md.slice(0, 3500)}`)).catch(() => { }); });
    // ── /gmail
    bot.onText(/\/gmail(?:\s+(.+))?/, (msg, match) => {
        if (!isAllowed(msg))
            return;
        const sub = match?.[1]?.trim() ?? '';
        void (async () => {
            if (!isGmailConnected()) {
                void bot?.sendMessage(msg.chat.id, '📧 Gmail not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env');
                return;
            }
            if (sub.startsWith('search ')) {
                const query = sub.slice(7).trim();
                const t = await bot?.sendMessage(msg.chat.id, '⏳ Searching...');
                if (t)
                    await sendResult(msg.chat.id, t.message_id, `📧 Gmail search results for "${query}" — feature requires @google/gmail-mcp`);
            }
            else {
                void bot?.sendMessage(msg.chat.id, '📧 Gmail connected — feature requires @google/gmail-mcp server for full functionality');
            }
        })();
    });
    // ── /news
    bot.onText(/\/news(?:\s+(.+))?/, (msg, match) => {
        if (!isAllowed(msg))
            return;
        const query = match?.[1]?.trim() ?? 'tech news today';
        void (async () => {
            const t = await bot?.sendMessage(msg.chat.id, '⏳ Fetching news...');
            try {
                const { newsAgent } = await import('./agents/news.js');
                const result = await newsAgent.handle(query);
                if (t)
                    await sendResult(msg.chat.id, t.message_id, result);
            }
            catch {
                if (t)
                    await bot?.editMessageText('❌ News fetch failed.', { chat_id: msg.chat.id, message_id: t.message_id });
            }
        })();
    });
    // ── Natural language (non-command messages) ────────────────────────────────
    bot.on('message', (msg) => {
        if (!isAllowed(msg))
            return;
        if (!msg.text || msg.text.startsWith('/'))
            return;
        void (async () => {
            const text = msg.text ?? '';
            // 0. Sub-agent router (news, etc.)
            try {
                const routed = await routeToSubAgent(text);
                if (routed.triggered && routed.response) {
                    const cleaned = cleanResponse(routed.response);
                    void bot?.sendMessage(msg.chat.id, cleaned);
                    appendHistory(msg.chat.id, 'user', text);
                    appendHistory(msg.chat.id, 'assistant', cleaned);
                    return;
                }
            }
            catch { /* fall through to main loop */ }
            // 1. Content commands (tweet this:, linkedin post about, etc.)
            const contentCmd = detectContentCmd(text);
            if (contentCmd) {
                const t = await bot?.sendMessage(msg.chat.id, '⏳ Generating...');
                try {
                    const result = await oppContentAgent.generateContent(contentCmd.type, contentCmd.topic);
                    if (t)
                        await sendResult(msg.chat.id, t.message_id, result);
                }
                catch {
                    if (t)
                        await bot?.editMessageText('❌ Generation failed.', { chat_id: msg.chat.id, message_id: t.message_id });
                }
                return;
            }
            // 2. URL detection → research capture
            const urlMatch = text.match(URL_REGEX);
            if (urlMatch) {
                const t = await bot?.sendMessage(msg.chat.id, '⏳ Analyzing URL...');
                try {
                    const result = await tradingAgent.interceptUrl(urlMatch[0]);
                    if (result && t) {
                        await sendResult(msg.chat.id, t.message_id, result);
                        return;
                    }
                }
                catch { /* fall through */ }
                if (t)
                    await bot?.editMessageText('⏳ Processing...', { chat_id: msg.chat.id, message_id: t.message_id });
            }
            // 3. Life OS capture intercept
            const captured = await lifeOsAgent.intercept(text);
            if (captured.handled) {
                void bot?.sendMessage(msg.chat.id, cleanResponse(captured.response ?? 'minicli captured ✓'));
                return;
            }
            // 4. Task-query shortcut
            const taskReply = handleTaskQuery(text);
            if (taskReply) {
                void bot?.sendMessage(msg.chat.id, cleanResponse(taskReply));
                return;
            }
            // 5. Main agent loop — routed through message queue
            const queueDepth = messageQueue.length;
            const thinkingText = queueDepth > 0
                ? `⏳ thinking... (+${queueDepth} queued)`
                : '⏳ thinking...';
            const t = await bot?.sendMessage(msg.chat.id, thinkingText);
            try {
                const history = getHistory(msg.chat.id);
                const result = await messageQueue.enqueue(msg.chat.id, text, history);
                if (t)
                    await sendResult(msg.chat.id, t.message_id, result);
                appendHistory(msg.chat.id, 'user', text);
                appendHistory(msg.chat.id, 'assistant', result);
                void tryReadAndSendFile(msg.chat.id, result).catch(() => { });
                const now = new Date().toISOString();
                const msgs = [
                    { role: 'user', content: text, timestamp: now },
                    { role: 'assistant', content: result, timestamp: now },
                ];
                void saveMemory({ timestamp: now, source: 'telegram', type: 'conversation', messages: msgs })
                    .then(() => updateUserProfile(msgs.map((m) => ({ role: m.role, content: m.content }))))
                    .catch(() => { });
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (t)
                    await bot?.editMessageText(`❌ ${errMsg.slice(0, 200)}`, { chat_id: msg.chat.id, message_id: t.message_id });
            }
        })();
    });
    return botName;
}
export async function stopTelegramBot() {
    if (bot) {
        await bot.stopPolling();
        bot = null;
    }
}
//# sourceMappingURL=telegram.js.map