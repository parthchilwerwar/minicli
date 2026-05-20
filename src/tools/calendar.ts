import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as http from 'http';
import type { ToolDefinition } from './registry.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const TOKEN_PATH = join(homedir(), '.minicli', 'google-token.json');
const SCOPES     = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'];
const CAL_BASE   = 'https://www.googleapis.com/calendar/v3';

const TokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expiry_date: z.number().optional(),
});

type TokenData = z.infer<typeof TokenSchema>;

function loadToken(): string {
  if (!existsSync(TOKEN_PATH)) throw new Error('Google Calendar not authenticated. Run: mini calendar auth');
  const data = TokenSchema.parse(JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')));
  return data.access_token;
}

function getClientCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId     = process.env['GOOGLE_CLIENT_ID']     ?? '';
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
  const redirectUri  = process.env['GOOGLE_REDIRECT_URI']  ?? 'http://localhost:3000/oauth/callback';
  if (!clientId || !clientSecret) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
  return { clientId, clientSecret, redirectUri };
}

async function calFetch(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const token = loadToken();
  const res = await fetch(`${CAL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Calendar ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<unknown>;
}

// ─── OAuth2 Flow ─────────────────────────────────────────────────────────────

export async function calendarAuth(): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getClientCredentials();
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(SCOPES.join(' '))}&access_type=offline&prompt=consent`;

  console.log(`\n  Open this URL in your browser:\n\n  ${authUrl}\n`);

  const port = new URL(redirectUri).port || '3000';

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      if (!code) { res.end('No code received'); return; }

      res.end('Google Calendar authenticated! You can close this tab.');

      void (async () => {
        try {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          });
          if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
          const tokenData = TokenSchema.parse(await tokenRes.json());
          writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
          console.log('  ✅ Google Calendar authenticated and token saved.');
          server.close();
          resolve();
        } catch (err) {
          server.close();
          reject(err);
        }
      })();
    });
    server.listen(parseInt(port, 10), () => console.log(`  Waiting for OAuth callback on :${port}...`));
    server.on('error', reject);
  });
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const EmptyParams = z.object({});

const CreateEventParams = z.object({
  title: z.string().describe('Event title'),
  startTime: z.string().describe('Start time (ISO 8601 or natural like "2pm")'),
  endTime: z.string().describe('End time (ISO 8601 or natural like "3pm")'),
  description: z.string().optional().describe('Event description'),
});

const FreeSlotsParams = z.object({
  durationMinutes: z.number().describe('Minimum free slot duration in minutes'),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}

interface CalEventList { items?: CalEvent[]; }

function formatEvent(e: CalEvent): string {
  const start = e.start?.dateTime ?? e.start?.date ?? 'unknown';
  const end   = e.end?.dateTime   ?? e.end?.date   ?? '';
  const time  = start.includes('T')
    ? `${new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end ? new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
    : 'all day';
  return `• ${time}  ${e.summary ?? '(no title)'}`;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export const calendarGetTodayTool: ToolDefinition = {
  name: 'calendar_get_today',
  description: 'Get today\'s Google Calendar events',
  parameters: EmptyParams,
  async execute() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const q     = `?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`;
    const data  = (await calFetch(`/calendars/primary/events${q}`)) as CalEventList;
    const events = data.items ?? [];
    if (!events.length) return 'No events today.';
    return events.map(formatEvent).join('\n');
  },
};

export const calendarGetWeekTool: ToolDefinition = {
  name: 'calendar_get_week',
  description: 'Get this week\'s Google Calendar events',
  parameters: EmptyParams,
  async execute() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();
    const q     = `?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`;
    const data  = (await calFetch(`/calendars/primary/events${q}`)) as CalEventList;
    const events = data.items ?? [];
    if (!events.length) return 'No events this week.';
    return events.map(formatEvent).join('\n');
  },
};

export const calendarCreateEventTool: ToolDefinition = {
  name: 'calendar_create_event',
  description: 'Create a Google Calendar event',
  parameters: CreateEventParams,
  async execute(args) {
    const { title, startTime, endTime, description } = CreateEventParams.parse(args);
    const event = (await calFetch('/calendars/primary/events', 'POST', {
      summary: title,
      description,
      start: { dateTime: new Date(startTime).toISOString() },
      end:   { dateTime: new Date(endTime).toISOString() },
    })) as CalEvent;
    return `Event created: "${event.summary}" — ${event.htmlLink ?? 'done'}`;
  },
};

export const calendarFreeSlotsTool: ToolDefinition = {
  name: 'calendar_find_free_slots',
  description: 'Find free time slots today of a given minimum duration',
  parameters: FreeSlotsParams,
  async execute(args) {
    const { durationMinutes } = FreeSlotsParams.parse(args);
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22).toISOString();
    const q     = `?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`;
    const data  = (await calFetch(`/calendars/primary/events${q}`)) as CalEventList;
    const events = data.items ?? [];

    const slots: string[] = [];
    let cursor = new Date(start);
    const dayEnd = new Date(end);

    for (const ev of events) {
      const evStart = new Date(ev.start?.dateTime ?? ev.start?.date ?? start);
      const gap = (evStart.getTime() - cursor.getTime()) / 60000;
      if (gap >= durationMinutes) {
        slots.push(`${cursor.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${evStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${Math.round(gap)} min)`);
      }
      cursor = new Date(ev.end?.dateTime ?? ev.end?.date ?? cursor.toISOString());
    }

    const finalGap = (dayEnd.getTime() - cursor.getTime()) / 60000;
    if (finalGap >= durationMinutes) {
      slots.push(`${cursor.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – 10:00 PM (${Math.round(finalGap)} min)`);
    }

    if (!slots.length) return `No free slots of ${durationMinutes}+ minutes found today.`;
    return `Free slots (≥${durationMinutes} min):\n` + slots.map((s) => `• ${s}`).join('\n');
  },
};
