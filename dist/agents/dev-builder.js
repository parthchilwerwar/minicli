import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import cron from 'node-cron';
import { z } from 'zod';
import { getRecentMemories } from '../memory-store.js';
import { callLLM } from '../llm.js';
import { sendToTelegram } from './base.js';
// ─── Schema ───────────────────────────────────────────────────────────────────
export const BugFindingSchema = z.object({
    id: z.string(), target: z.string(), type: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string(),
    status: z.enum(['found', 'reported', 'accepted', 'rejected']),
    foundAt: z.string(), reward: z.number().optional(),
});
const DIR = path.join(homedir(), '.minicli');
const BOUNTY_FILE = path.join(DIR, 'bug-bounty.json');
function ensure() {
    if (!fs.existsSync(DIR))
        fs.mkdirSync(DIR, { recursive: true });
}
export function loadBounties() {
    ensure();
    if (!fs.existsSync(BOUNTY_FILE))
        return [];
    try {
        return z.array(BugFindingSchema).parse(JSON.parse(fs.readFileSync(BOUNTY_FILE, 'utf-8')));
    }
    catch {
        return [];
    }
}
export function saveBounties(b) {
    ensure();
    fs.writeFileSync(BOUNTY_FILE, JSON.stringify(b, null, 2));
}
// ─── GitHub helpers ───────────────────────────────────────────────────────────
async function ghFetch(urlPath) {
    const token = process.env['GITHUB_TOKEN'];
    if (!token)
        return null;
    try {
        const res = await fetch(`https://api.github.com${urlPath}`, {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'minicli' },
        });
        return res.ok ? (await res.json()) : null;
    }
    catch {
        return null;
    }
}
// ─── Agent ────────────────────────────────────────────────────────────────────
export class DevBuilderAgent {
    name = 'Dev & Builder';
    description = 'GitHub check, commit rewriter, bug bounty';
    dailyJob = null;
    passiveJob = null;
    lastNudge = 0;
    async init() {
        const dc = process.env['DEV_CHECK_CRON'] ?? '30 9 * * *';
        this.dailyJob = cron.schedule(dc, () => { void this.dailyCheck(); });
        this.passiveJob = cron.schedule('0 */6 * * *', () => { void this.passiveCheck(); });
    }
    async stop() {
        this.dailyJob?.stop();
        this.passiveJob?.stop();
    }
    async dailyCheck() {
        try {
            const owner = process.env['GITHUB_DEFAULT_OWNER'] ?? '';
            const reposRaw = process.env['GITHUB_REPOS'] ?? '';
            const repos = reposRaw.split(',').map((r) => r.trim()).filter(Boolean);
            if (!owner || !repos.length)
                return;
            const lines = [];
            for (const repo of repos.slice(0, 4)) {
                const commits = await ghFetch(`/repos/${owner}/${repo}/commits?per_page=5`);
                const prs = await ghFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=5`);
                lines.push(`*${repo}*`);
                lines.push(`  ${commits?.length ?? 0} recent commits`);
                if (prs?.length)
                    lines.push(`  ${prs.length} open PRs`);
            }
            const bounties = loadBounties();
            if (bounties.length)
                lines.push(`\n🐛 ${bounties.length} bug bounty targets`);
            const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
            await sendToTelegram(`💻 Dev check — ${dayName}\n\n${lines.join('\n')}`);
        }
        catch (err) {
            console.error('[dev-builder]', err instanceof Error ? err.message : err);
        }
    }
    async rewriteCommit(repo) {
        const owner = process.env['GITHUB_DEFAULT_OWNER'] ?? '';
        if (!owner)
            return 'GITHUB_DEFAULT_OWNER not set';
        const commits = await ghFetch(`/repos/${owner}/${repo}/commits?per_page=1`);
        if (!commits?.length)
            return 'No commits found';
        const diffRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${commits[0].sha}`, {
            headers: { Authorization: `Bearer ${process.env['GITHUB_TOKEN'] ?? ''}`, Accept: 'application/vnd.github.v3.diff', 'User-Agent': 'minicli' },
        });
        const diff = await diffRes.text();
        const res = await callLLM([{ role: 'user', content: `Rewrite as conventional commit. ONLY the message.\n\nDiff:\n${diff.slice(0, 3000)}` }]);
        return res.content.trim();
    }
    async passiveCheck() {
        if (Date.now() - this.lastNudge < 86400000)
            return;
        try {
            const mems = getRecentMemories(30).filter((m) => Date.now() - new Date(m.timestamp).getTime() < 172800000);
            if (!mems.length)
                return;
            const ctx = mems.map((m) => `[${m.type}] ${m.title}`).join('\n');
            const prompt = `Dev nudge needed? JSON only:\n{ "shouldNudge": boolean, "nudge": "msg" }\n\n${ctx.slice(0, 2000)}`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const d = z.object({ shouldNudge: z.boolean(), nudge: z.string().optional() }).parse(JSON.parse(raw));
            if (d.shouldNudge && d.nudge) {
                await sendToTelegram(`💻 ${d.nudge}`);
                this.lastNudge = Date.now();
            }
        }
        catch { /* best-effort */ }
    }
}
//# sourceMappingURL=dev-builder.js.map