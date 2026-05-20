import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import cron from 'node-cron';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { saveMemory } from '../memory-store.js';
import { callLLM } from '../llm.js';
import { sendToTelegram } from './base.js';
import type { Agent } from './base.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const WatchlistSchema = z.object({
  id: z.string(), asset: z.string(), type: z.enum(['crypto', 'stock']),
  alertThreshold: z.number(), addedAt: z.string(), lastAlertAt: z.string().nullable(),
});

export const ResearchSchema = z.object({
  id: z.string(), url: z.string(), title: z.string(), summary: z.string(),
  keyPoints: z.array(z.string()), tags: z.array(z.string()),
  savedAt: z.string(), linkedProjects: z.array(z.string()),
});

export type WatchlistItem = z.infer<typeof WatchlistSchema>;
export type ResearchItem  = z.infer<typeof ResearchSchema>;

const DIR = path.join(homedir(), '.minicli');
const WATCH_FILE    = path.join(DIR, 'watchlist.json');
const RESEARCH_FILE = path.join(DIR, 'research.json');

function ensure(): void { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }

export function loadWatchlist(): WatchlistItem[] {
  ensure(); if (!fs.existsSync(WATCH_FILE)) return [];
  try { return z.array(WatchlistSchema).parse(JSON.parse(fs.readFileSync(WATCH_FILE, 'utf-8'))); }
  catch { return []; }
}
export function saveWatchlist(w: WatchlistItem[]): void { ensure(); fs.writeFileSync(WATCH_FILE, JSON.stringify(w, null, 2)); }

export function loadResearch(): ResearchItem[] {
  ensure(); if (!fs.existsSync(RESEARCH_FILE)) return [];
  try { return z.array(ResearchSchema).parse(JSON.parse(fs.readFileSync(RESEARCH_FILE, 'utf-8'))); }
  catch { return []; }
}
export function saveResearch(r: ResearchItem[]): void { ensure(); fs.writeFileSync(RESEARCH_FILE, JSON.stringify(r, null, 2)); }

// ─── CoinGecko helper ────────────────────────────────────────────────────────

interface PriceData { usd: number; usd_24h_change?: number; }

async function fetchPrices(ids: string[]): Promise<Record<string, PriceData>> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return (await res.json()) as Record<string, PriceData>;
  } catch { return {}; }
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class TradingResearchAgent implements Agent {
  name = 'Trading+Research';
  description = 'Market brief, research capture, price alerts';

  private marketJob: cron.ScheduledTask | null = null;
  private alertJob: cron.ScheduledTask | null = null;

  async init(): Promise<void> {
    const mc = process.env['MARKET_BRIEF_CRON'] ?? '0 8 * * 1-5';
    this.marketJob = cron.schedule(mc, () => { void this.marketBrief(); });
    this.alertJob  = cron.schedule('0 */4 * * *', () => { void this.checkAlerts(); });
  }

  async stop(): Promise<void> { this.marketJob?.stop(); this.alertJob?.stop(); }

  // ── Behavior A: Market brief ───────────────────────────────────────────────

  async marketBrief(): Promise<void> {
    try {
      const assetsStr = process.env['TRACKED_ASSETS'] ?? 'bitcoin,ethereum,solana';
      const ids = assetsStr.split(',').map((a) => a.trim());
      const prices = await fetchPrices(ids);
      if (!Object.keys(prices).length) return;

      const lines: string[] = [];
      for (const id of ids) {
        const p = prices[id];
        if (!p) continue;
        const change = p.usd_24h_change ?? 0;
        const arrow = change >= 0 ? '▲' : '▼';
        const notable = Math.abs(change) > 5 ? ' ← notable move' : '';
        lines.push(`${id.toUpperCase()}: $${p.usd.toLocaleString()} ${arrow} ${Math.abs(change).toFixed(1)}%${notable}`);
      }

      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
      await sendToTelegram(`📈 Market brief — ${dayName}\n\n${lines.join('\n')}`);
    } catch (err) { console.error('[trading] market brief error:', err instanceof Error ? err.message : err); }
  }

  // ── Behavior B: Research capture (URL intercept) ───────────────────────────

  async interceptUrl(url: string): Promise<string | null> {
    try {
      const fetchRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const html = await fetchRes.text();
      const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);

      const prompt = `Summarize this web page. Output JSON only:\n{ "title": "page title", "keyPoints": ["3-5 bullets"], "tags": ["tag1","tag2"], "linkedProjects": ["project if relevant"] }\n\nURL: ${url}\nContent: ${textContent}`;
      const res = await callLLM([{ role: 'user', content: prompt }]);
      const raw = res.content.trim().replace(/```json|```/g, '').trim();
      const data = z.object({
        title: z.string(), keyPoints: z.array(z.string()),
        tags: z.array(z.string()), linkedProjects: z.array(z.string()),
      }).parse(JSON.parse(raw));

      const item: ResearchItem = {
        id: nanoid(8), url, title: data.title, summary: data.keyPoints.join('; '),
        keyPoints: data.keyPoints, tags: data.tags, savedAt: new Date().toISOString(),
        linkedProjects: data.linkedProjects,
      };
      const research = loadResearch(); research.push(item); saveResearch(research);
      void saveMemory({ timestamp: item.savedAt, source: 'telegram', type: 'note',
        messages: [{ role: 'user', content: `Research: ${data.title} - ${url}`, timestamp: item.savedAt }] });

      const kp = data.keyPoints.map((p) => `• ${p}`).join('\n');
      const linked = data.linkedProjects.length ? `\nLinked to: ${data.linkedProjects.join(', ')}` : '';
      return `📄 *Research saved*\n\nTitle: ${data.title}\nSource: ${new URL(url).hostname}\n\nKey points:\n${kp}${linked}\n\nSaved to memory ✓`;
    } catch { return null; }
  }

  // ── Behavior C: Price alerts ───────────────────────────────────────────────

  private async checkAlerts(): Promise<void> {
    try {
      const watchlist = loadWatchlist();
      if (!watchlist.length) return;
      const threshold = parseInt(process.env['PRICE_ALERT_THRESHOLD'] ?? '5', 10);
      const ids = watchlist.filter((w) => w.type === 'crypto').map((w) => w.asset.toLowerCase());
      if (!ids.length) return;
      const prices = await fetchPrices(ids);
      let changed = false;

      for (const w of watchlist) {
        const p = prices[w.asset.toLowerCase()];
        if (!p) continue;
        const change = Math.abs(p.usd_24h_change ?? 0);
        if (change < (w.alertThreshold || threshold)) continue;
        if (w.lastAlertAt && Date.now() - new Date(w.lastAlertAt).getTime() < 86400000) continue;

        const arrow = (p.usd_24h_change ?? 0) >= 0 ? '+' : '';
        await sendToTelegram(`🚨 Price alert\n${w.asset.toUpperCase()} moved ${arrow}${(p.usd_24h_change ?? 0).toFixed(1)}% in 24h`);
        w.lastAlertAt = new Date().toISOString(); changed = true;
      }
      if (changed) saveWatchlist(watchlist);
    } catch { /* best-effort */ }
  }
}
