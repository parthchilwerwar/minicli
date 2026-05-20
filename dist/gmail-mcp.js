import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
// ─── Config ──────────────────────────────────────────────────────────────────
const TOKEN_PATH = join(homedir(), '.minicli', 'gmail-token.json');
const CONFIG_DIR = join(homedir(), '.minicli');
let gmailConnected = false;
let cachedTokens = null;
// ─── Token management ────────────────────────────────────────────────────────
function loadTokens() {
    if (cachedTokens)
        return cachedTokens;
    if (!existsSync(TOKEN_PATH))
        return null;
    try {
        const raw = readFileSync(TOKEN_PATH, 'utf-8');
        cachedTokens = JSON.parse(raw);
        return cachedTokens;
    }
    catch {
        return null;
    }
}
function saveTokens(tokens) {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    cachedTokens = tokens;
}
function hasCredentials() {
    return !!(process.env['GOOGLE_CLIENT_ID'] &&
        process.env['GOOGLE_CLIENT_SECRET'] &&
        (process.env['GMAIL_REFRESH_TOKEN'] || loadTokens()));
}
// ─── Start / Stop ─────────────────────────────────────────────────────────────
export async function startGmailMCP() {
    if (!hasCredentials()) {
        return 'not configured';
    }
    // If we have a refresh token in env but not saved, save it
    const envRefresh = process.env['GMAIL_REFRESH_TOKEN'];
    if (envRefresh && !loadTokens()) {
        saveTokens({
            access_token: '',
            refresh_token: envRefresh,
            expiry_date: 0,
        });
    }
    gmailConnected = true;
    return 'connected';
}
export async function stopGmailMCP() {
    gmailConnected = false;
    cachedTokens = null;
}
export function isGmailConnected() {
    return gmailConnected;
}
// ─── Gmail tool stubs ─────────────────────────────────────────────────────────
// These provide the tool interface. When Gmail MCP server is available,
// swap these stubs for actual MCP calls.
async function gmailApiCall(action, _params) {
    if (!gmailConnected) {
        return '❌ Gmail not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env';
    }
    return `📧 Gmail ${action}: Feature requires @google/gmail-mcp server. Configure credentials and install the MCP package.`;
}
// ─── Tool definitions ─────────────────────────────────────────────────────────
export const gmailListTool = {
    name: 'gmail_list',
    description: 'List recent emails with sender and subject',
    parameters: z.object({
        maxResults: z.number().optional().describe('Max emails to return (default 10)'),
    }),
    execute: async (args) => gmailApiCall('list', args),
};
export const gmailReadTool = {
    name: 'gmail_read',
    description: 'Read full email by ID',
    parameters: z.object({
        emailId: z.string().describe('Email ID to read'),
    }),
    execute: async (args) => gmailApiCall('read', args),
};
export const gmailSendTool = {
    name: 'gmail_send',
    description: 'Send an email (requires explicit user confirmation)',
    parameters: z.object({
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body text'),
    }),
    execute: async (args) => {
        // Safety: gmail_send ALWAYS requires confirmation
        return `⚠️ Email draft prepared:\nTo: ${String(args['to'] ?? '')}\nSubject: ${String(args['subject'] ?? '')}\n\nConfirm in Telegram before sending.`;
    },
};
export const gmailSearchTool = {
    name: 'gmail_search',
    description: 'Search emails by query',
    parameters: z.object({
        query: z.string().describe('Search query (Gmail search syntax)'),
        maxResults: z.number().optional().describe('Max results (default 5)'),
    }),
    execute: async (args) => gmailApiCall('search', args),
};
export const gmailUnreadCountTool = {
    name: 'gmail_unread_count',
    description: 'Get unread email count',
    parameters: z.object({}),
    execute: async (args) => gmailApiCall('unread_count', args),
};
// ─── Gmail MCP server config (for mcp.ts) ─────────────────────────────────────
export const gmailMCPConfig = {
    name: 'gmail',
    command: 'npx',
    args: ['-y', '@google/gmail-mcp'],
    env: {
        GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'] ?? '',
        GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
        GOOGLE_REFRESH_TOKEN: process.env['GMAIL_REFRESH_TOKEN'] ?? '',
    },
};
//# sourceMappingURL=gmail-mcp.js.map