import TelegramBot from 'node-telegram-bot-api';
import chalk from 'chalk';

// ─── Shared bot reference (set once Telegram starts) ─────────────────────────

let _botRef: TelegramBot | null = null;
let _allowedUserId: number | null = null;

export function setBotRef(bot: TelegramBot, userId: number): void {
  _botRef = bot;
  _allowedUserId = userId;
}

export function getBotRef(): TelegramBot | null { return _botRef; }

// ─── Agent Interface ──────────────────────────────────────────────────────────

export interface Agent {
  name: string;
  description: string;
  init(): Promise<void>;
  stop(): Promise<void>;
}

// ─── Section-based output ─────────────────────────────────────────────────────

export interface AgentSection {
  emoji: string;
  title: string;
  lines: string[];
  alert?: boolean;
}

export function formatTelegram(sections: AgentSection[]): string {
  return sections
    .map(({ emoji, title, lines }) =>
      `${emoji} *${title}*\n${lines.join('\n')}`)
    .join('\n\n');
}

export function formatCLI(sections: AgentSection[]): string {
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

export function printToCLI(sections: AgentSection[]): void {
  console.log('\n' + formatCLI(sections) + '\n');
}

export async function broadcast(
  sections: AgentSection[],
  source: 'scheduled' | 'manual'
): Promise<void> {
  if (source === 'scheduled') {
    await sendToTelegram(formatTelegram(sections));
    if (process.stdout.isTTY) printToCLI(sections);
  } else {
    printToCLI(sections);
    if (_botRef && _allowedUserId) {
      await sendToTelegram(formatTelegram(sections));
    }
  }
}

// ─── sendToTelegram ───────────────────────────────────────────────────────────

export async function sendToTelegram(message: string): Promise<void> {
  if (!_botRef || !_allowedUserId) return;
  const parts = splitMessage(message);
  for (const part of parts) {
    try {
      await _botRef.sendMessage(_allowedUserId, part, { parse_mode: 'Markdown' });
    } catch {
      try {
        await _botRef.sendMessage(_allowedUserId, part.replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&'));
      } catch { /* best-effort */ }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, maxLen);
    if (remaining.length > maxLen) {
      const nl = chunk.lastIndexOf('\n');
      if (nl > maxLen * 0.5) chunk = chunk.slice(0, nl);
    }
    parts.push(chunk);
    remaining = remaining.slice(chunk.length);
  }
  return parts;
}

export function formatMessage(sections: { emoji: string; title: string; content: string }[]): string {
  return sections
    .map(({ emoji, title, content }) => `${emoji} *${title}*\n${content}`)
    .join('\n\n');
}
