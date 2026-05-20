import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { callLLM } from './llm.js';
const PERSONA_DIR = join(homedir(), '.minicli', 'persona');
const SOUL_FILE = join(PERSONA_DIR, 'SOUL.md');
const IDENTITY_FILE = join(PERSONA_DIR, 'IDENTITY.md');
const USER_FILE = join(PERSONA_DIR, 'USER.md');
const AUTO_DONE = join(PERSONA_DIR, '.auto-generated');
// ─── Default templates ────────────────────────────────────────────────────────
const DEFAULT_SOUL = `# Soul

## Personality
You are Parth's personal agent. You are direct, sharp, and never waste words.
You think like a hacker and a builder. You care about craft.

## Tone
- Terminal-native: clear, precise, no filler
- Casual but smart — like a senior dev who's also your friend
- Never robotic, never corporate

## Values
- Speed over ceremony
- Own your mistakes fast
- Always tell the truth, even if it's uncomfortable
`;
const DEFAULT_IDENTITY = `# Identity

## Name
Eden (your personal agent)

## Role
I am Parth's always-on personal agent. I live in his terminal and his Telegram.
I remember everything he tells me. I know his projects, his goals, his patterns.

## Capabilities
- File system access (vault, desktop, downloads)
- Memory across all conversations
- Task, habit, and reminder management
- GitHub, market tracking, and daily briefings
- Content generation (tweets, LinkedIn, README)
- Bug bounty tracking and opportunity discovery
`;
const DEFAULT_USER = `# User Profile — Parth

## Work patterns
(AI fills this in automatically)

## Communication style
(AI fills this in automatically)

## Current projects
(AI fills this in automatically)

## Preferences
(AI fills this in automatically)

## Recent context
(AI fills this in automatically)
`;
// ─── Init ─────────────────────────────────────────────────────────────────────
export function initPersona() {
    if (!existsSync(PERSONA_DIR))
        mkdirSync(PERSONA_DIR, { recursive: true });
    if (!existsSync(SOUL_FILE))
        writeFileSync(SOUL_FILE, DEFAULT_SOUL);
    if (!existsSync(IDENTITY_FILE))
        writeFileSync(IDENTITY_FILE, DEFAULT_IDENTITY);
    if (!existsSync(USER_FILE))
        writeFileSync(USER_FILE, DEFAULT_USER);
}
// ─── Load ─────────────────────────────────────────────────────────────────────
export function loadPersona() {
    initPersona();
    const soul = existsSync(SOUL_FILE) ? readFileSync(SOUL_FILE, 'utf-8') : DEFAULT_SOUL;
    const identity = existsSync(IDENTITY_FILE) ? readFileSync(IDENTITY_FILE, 'utf-8') : DEFAULT_IDENTITY;
    const user = existsSync(USER_FILE) ? readFileSync(USER_FILE, 'utf-8') : DEFAULT_USER;
    return `[PERSONA]\n${soul}\n${identity}\n${user}\n[/PERSONA]\n`;
}
export function loadUserMd() {
    if (!existsSync(USER_FILE))
        return DEFAULT_USER;
    return readFileSync(USER_FILE, 'utf-8');
}
// ─── Update user profile after conversation ───────────────────────────────────
export async function updateUserProfile(conversation) {
    if (conversation.length === 0)
        return;
    try {
        const currentUser = loadUserMd();
        const convText = conversation.map((m) => `${m.role}: ${m.content}`).join('\n');
        const prompt = `Current USER.md:\n${currentUser}\n\nNew conversation:\n${convText}\n\nUpdate USER.md with anything new you learned about the user from this conversation. Preserve existing entries. Only add/update, never delete. Be concise. Output only the complete updated USER.md content, starting with "# User Profile":`;
        const res = await callLLM([{ role: 'user', content: prompt }]);
        const updated = res.content.trim();
        if (updated && updated.startsWith('#')) {
            writeFileSync(USER_FILE, updated + '\n');
        }
    }
    catch { /* best-effort: never crash the caller */ }
}
// ─── Auto-generate persona from memories (runs once on first daemon start) ───
export async function autoGeneratePersona() {
    if (existsSync(AUTO_DONE))
        return null; // already done
    try {
        const { getRecentMemories } = await import('./memory-store.js');
        const memories = getRecentMemories(30);
        const memCtx = memories.map((m) => `[${m.type}] ${m.title}: ${m.summary}`).join('\n');
        if (!memCtx || memories.length < 3) {
            // Not enough data yet — mark as done with defaults
            writeFileSync(AUTO_DONE, new Date().toISOString());
            return '🎭 Personality initialized with defaults. I\'ll learn more about you as we chat!';
        }
        const prompt = `Based on these conversation memories, build a user profile. Output ONLY the complete USER.md content:\n\n${memCtx.slice(0, 3000)}\n\nFormat:\n# User Profile — Parth\n\n## Work patterns\n...\n\n## Communication style\n...\n\n## Current projects\n...\n\n## Preferences\n...\n\n## Recent context\n...`;
        const res = await callLLM([{ role: 'user', content: prompt }]);
        const profile = res.content.trim();
        if (profile && profile.startsWith('#')) {
            writeFileSync(USER_FILE, profile + '\n');
        }
        writeFileSync(AUTO_DONE, new Date().toISOString());
        return `🎭 *Personality auto-generated!*\n\nI've analyzed your ${memories.length} recent conversations and built your profile. Use /persona to view it. I'll keep updating it as we chat.`;
    }
    catch {
        writeFileSync(AUTO_DONE, new Date().toISOString());
        return null;
    }
}
//# sourceMappingURL=persona.js.map