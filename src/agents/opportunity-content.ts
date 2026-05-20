import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import cron from 'node-cron';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getRecentMemories } from '../memory-store.js';
import { callLLM } from '../llm.js';
import { sendToTelegram } from './base.js';
import type { Agent } from './base.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const OpportunitySchema = z.object({
  id: z.string(), type: z.enum(['hackathon', 'internship', 'bounty', 'tool']),
  title: z.string(), description: z.string(), deadline: z.string().nullable(),
  url: z.string(), relevanceScore: z.number(), seen: z.boolean(), savedAt: z.string(),
});

export const ContentLogSchema = z.object({
  id: z.string(), type: z.enum(['tweet', 'linkedin', 'readme', 'announcement']),
  topic: z.string(), generatedAt: z.string(), posted: z.boolean(),
  postedAt: z.string().nullable(), platform: z.string().nullable(),
});

export type Opportunity = z.infer<typeof OpportunitySchema>;
export type ContentLog  = z.infer<typeof ContentLogSchema>;

const DIR = path.join(homedir(), '.minicli');
const OPP_FILE     = path.join(DIR, 'opportunities.json');
const CONTENT_FILE = path.join(DIR, 'content-log.json');

function ensure(): void { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }

export function loadOpportunities(): Opportunity[] {
  ensure(); if (!fs.existsSync(OPP_FILE)) return [];
  try { return z.array(OpportunitySchema).parse(JSON.parse(fs.readFileSync(OPP_FILE, 'utf-8'))); }
  catch { return []; }
}
export function saveOpportunities(o: Opportunity[]): void { ensure(); fs.writeFileSync(OPP_FILE, JSON.stringify(o, null, 2)); }

export function loadContentLog(): ContentLog[] {
  ensure(); if (!fs.existsSync(CONTENT_FILE)) return [];
  try { return z.array(ContentLogSchema).parse(JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'))); }
  catch { return []; }
}
export function saveContentLog(c: ContentLog[]): void { ensure(); fs.writeFileSync(CONTENT_FILE, JSON.stringify(c, null, 2)); }

// ─── Agent ────────────────────────────────────────────────────────────────────

export class OpportunityContentAgent implements Agent {
  name = 'Opportunity+Content';
  description = 'Weekly opportunities, content generation, calendar';

  private digestJob: cron.ScheduledTask | null = null;
  private contentJob: cron.ScheduledTask | null = null;

  async init(): Promise<void> {
    const oc = process.env['OPP_DIGEST_CRON'] ?? '0 9 * * 1';
    this.digestJob  = cron.schedule(oc, () => { void this.weeklyDigest(); });
    this.contentJob = cron.schedule('0 10 * * 1', () => { void this.contentReminder(); });
  }

  async stop(): Promise<void> { this.digestJob?.stop(); this.contentJob?.stop(); }

  // ── Behavior A: Weekly opportunity digest ──────────────────────────────────

  async weeklyDigest(): Promise<void> {
    try {
      const memories = getRecentMemories(20);
      const skills = memories.flatMap((m) => m.tags).filter(Boolean);
      const ctx = `User skills/interests: ${[...new Set(skills)].join(', ') || 'AI, ML, web dev, security'}`;

      const prompt = `Generate a weekly opportunity digest for a CS student interested in AI/ML, web dev, and bug bounty. Output JSON only:\n{ "hackathons": [{"title":"","deadline":"","note":""}], "internships": [{"title":"","note":""}], "bounties": [{"title":"","note":""}], "tools": [{"title":"","note":""}] }\n\n${ctx}`;

      const res = await callLLM([{ role: 'user', content: prompt }]);
      const raw = res.content.trim().replace(/```json|```/g, '').trim();
      const data = z.object({
        hackathons: z.array(z.object({ title: z.string(), deadline: z.string().optional(), note: z.string().optional() })),
        internships: z.array(z.object({ title: z.string(), note: z.string().optional() })),
        bounties: z.array(z.object({ title: z.string(), note: z.string().optional() })),
        tools: z.array(z.object({ title: z.string(), note: z.string().optional() })),
      }).parse(JSON.parse(raw));

      const weekOf = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const sections = [
        data.hackathons.length ? `🏆 *Hackathons*\n${data.hackathons.map((h) => `• ${h.title}${h.deadline ? ` — ${h.deadline}` : ''}`).join('\n')}` : '',
        data.internships.length ? `💼 *Internships*\n${data.internships.map((i) => `• ${i.title}`).join('\n')}` : '',
        data.bounties.length ? `🐛 *Bug Bounty*\n${data.bounties.map((b) => `• ${b.title}`).join('\n')}` : '',
        data.tools.length ? `🛠 *New tools*\n${data.tools.map((t) => `• ${t.title}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n');

      await sendToTelegram(`🎯 Weekly opportunities — Week of ${weekOf}\n\n${sections}`);
    } catch (err) { console.error('[opportunity] digest error:', err instanceof Error ? err.message : err); }
  }

  // ── Behavior B: Content generator ──────────────────────────────────────────

  async generateContent(type: 'tweet' | 'linkedin' | 'readme' | 'announcement', topic: string): Promise<string> {
    const prompts: Record<string, string> = {
      tweet: `Generate a tweet thread (5 tweets) about: "${topic}". Output each tweet numbered 1/ 2/ etc. Be engaging, authentic, technical.`,
      linkedin: `Generate a LinkedIn post (~280 words, professional tone) about: "${topic}". Start with a hook.`,
      readme: `Generate a README.md for the project: "${topic}". Include: description, features, install, usage, tech stack.`,
      announcement: `Generate a product announcement post about: "${topic}". Exciting but authentic tone.`,
    };

    const res = await callLLM([{ role: 'user', content: prompts[type] ?? prompts['tweet'] }]);
    const content = res.content.trim();

    const log = loadContentLog();
    log.push({ id: nanoid(8), type, topic, generatedAt: new Date().toISOString(), posted: false, postedAt: null, platform: null });
    saveContentLog(log);

    const emoji = { tweet: '🐦', linkedin: '💼', readme: '📄', announcement: '📢' }[type];
    return `${emoji} *${type.charAt(0).toUpperCase() + type.slice(1)}*\n\n${content}`;
  }

  // ── Behavior D: Content calendar reminder ──────────────────────────────────

  private async contentReminder(): Promise<void> {
    try {
      const log = loadContentLog();
      const posted = log.filter((c) => c.posted);
      const lastPost = posted.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))[0];
      if (lastPost) {
        const daysSince = (Date.now() - new Date(lastPost.postedAt ?? lastPost.generatedAt).getTime()) / 86400000;
        if (daysSince < 7) return;
      }
      const recent = log.filter((c) => !c.posted).slice(-1)[0];
      const idea = recent ? `Your last idea: "${recent.topic}" — want me to turn it into a tweet thread?` : 'Want to brainstorm some content ideas?';
      await sendToTelegram(`📢 Content reminder\nYou haven't posted anything in 7+ days.\n${idea}`);
    } catch { /* best-effort */ }
  }
}
