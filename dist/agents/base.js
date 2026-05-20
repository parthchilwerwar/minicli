import chalk from 'chalk';
// ─── Shared bot reference (set once Telegram starts) ─────────────────────────
let _botRef = null;
let _allowedUserId = null;
export function setBotRef(bot, userId) {
    _botRef = bot;
    _allowedUserId = userId;
}
export function getBotRef() { return _botRef; }
export function formatTelegram(sections) {
    return sections
        .map(({ emoji, title, lines }) => `${emoji} *${title}*\n${lines.join('\n')}`)
        .join('\n\n');
}
export function formatCLI(sections) {
    return sections
        .map(({ emoji, title, lines, alert }) => {
        const header = alert
            ? chalk.red(`${emoji} ${title}`)
            : chalk.cyan(`${emoji} ${title}`);
        const body = lines.map((l) => `  ${chalk.white(l)}`).join('\n');
        return `${header}\n${body}`;
    })
        .join('\n\n');
}
export function printToCLI(sections) {
    console.log('\n' + formatCLI(sections) + '\n');
}
export async function broadcast(sections, source) {
    if (source === 'scheduled') {
        await sendToTelegram(formatTelegram(sections));
        if (process.stdout.isTTY)
            printToCLI(sections);
    }
    else {
        printToCLI(sections);
        if (_botRef && _allowedUserId) {
            await sendToTelegram(formatTelegram(sections));
        }
    }
}
// ─── sendToTelegram ───────────────────────────────────────────────────────────
export async function sendToTelegram(message) {
    if (!_botRef || !_allowedUserId)
        return;
    const parts = splitMessage(message);
    for (const part of parts) {
        try {
            await _botRef.sendMessage(_allowedUserId, part, { parse_mode: 'Markdown' });
        }
        catch {
            try {
                await _botRef.sendMessage(_allowedUserId, part.replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&'));
            }
            catch { /* best-effort */ }
        }
    }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
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
export function formatMessage(sections) {
    return sections
        .map(({ emoji, title, content }) => `${emoji} *${title}*\n${content}`)
        .join('\n\n');
}
//# sourceMappingURL=base.js.map