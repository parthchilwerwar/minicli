import cron from 'node-cron';
import { z } from 'zod';
import { getRecentMemories } from '../memory-store.js';
import { callLLM } from '../llm.js';
import { sendToTelegram, formatMessage } from './base.js';
async function fetchGitHub(path) {
    const token = process.env['GITHUB_TOKEN'];
    if (!token)
        return null;
    try {
        const res = await fetch(`https://api.github.com${path}`, {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'minicli' },
        });
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
// ─── Agent ────────────────────────────────────────────────────────────────────
export class DevAssistantAgent {
    name = 'dev-assistant';
    description = 'Daily GitHub summary at 9am + passive dev pattern nudges';
    dailyTask = null;
    passiveTask = null;
    lastNudgeAt = 0;
    async init() {
        this.dailyTask = cron.schedule('30 9 * * *', () => { void this.dailyCheck(); });
        this.passiveTask = cron.schedule('0 */6 * * *', () => { void this.passiveCheck(); });
    }
    async stop() {
        this.dailyTask?.stop();
        this.passiveTask?.stop();
        this.dailyTask = this.passiveTask = null;
    }
    async dailyCheck() {
        try {
            const owner = process.env['GITHUB_DEFAULT_OWNER'] ?? '';
            const repo = process.env['GITHUB_DEFAULT_REPO'] ?? '';
            let ghContext = '';
            if (owner && repo) {
                const issues = await fetchGitHub(`/repos/${owner}/${repo}/issues?state=open&per_page=5`);
                const commits = await fetchGitHub(`/repos/${owner}/${repo}/commits?per_page=5`);
                const now = Date.now();
                const oldIssues = (issues ?? []).filter((i) => {
                    const ageDays = (now - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
                    return ageDays >= 5;
                });
                if (issues)
                    ghContext += `Open issues (${issues.length}): ${issues.map((i) => `#${i.number} "${i.title}"`).join(', ')}\n`;
                if (commits)
                    ghContext += `Recent commits: ${commits.slice(0, 3).map((c) => `"${c.commit.message.slice(0, 50)}"`).join(', ')}\n`;
                if (oldIssues.length)
                    ghContext += `Stale issues (5+ days): ${oldIssues.map((i) => `#${i.number} "${i.title}"`).join(', ')}\n`;
            }
            const memories = getRecentMemories(20);
            const devMemories = memories.filter((m) => m.tags.some((t) => ['dev', 'code', 'github', 'project'].includes(t)));
            const memContext = devMemories.map((m) => `[${m.type}] ${m.title}`).join('\n') || 'No recent dev activity';
            if (!ghContext && !devMemories.length)
                return;
            const prompt = `Generate a concise dev assistant update. Output JSON only:\n{ "summary": "2-3 sentence dev status", "suggestions": ["up to 2 suggestions"], "hasContent": boolean }\n\nGitHub:\n${ghContext || 'no token set'}\n\nRecent dev memories:\n${memContext}`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({
                summary: z.string(),
                suggestions: z.array(z.string()),
                hasContent: z.boolean(),
            }).parse(JSON.parse(raw));
            if (!data.hasContent)
                return;
            const message = formatMessage([
                { emoji: '💻', title: 'Dev update', content: data.summary },
                ...(data.suggestions.length
                    ? [{ emoji: '💡', title: 'Suggestions', content: data.suggestions.map((s) => `• ${s}`).join('\n') }]
                    : []),
            ]);
            await sendToTelegram(message);
        }
        catch (err) {
            console.error('[dev-assistant] dailyCheck error:', err instanceof Error ? err.message : err);
        }
    }
    async passiveCheck() {
        // Don't nudge more than once per 24h
        if (Date.now() - this.lastNudgeAt < 24 * 60 * 60 * 1000)
            return;
        try {
            const memories = getRecentMemories(30);
            const last48h = memories.filter((m) => {
                const age = Date.now() - new Date(m.timestamp).getTime();
                return age < 48 * 60 * 60 * 1000;
            });
            if (!last48h.length)
                return;
            const memContext = last48h.map((m) => `[${m.type}] ${m.title}: ${m.summary}`).join('\n');
            const prompt = `Based on these memories, are there any dev-related things that need a follow-up nudge? Output JSON only:\n{ "shouldNudge": boolean, "nudge": "short nudge message if needed" }\n\nMemories:\n${memContext.slice(0, 2000)}`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({ shouldNudge: z.boolean(), nudge: z.string().optional() }).parse(JSON.parse(raw));
            if (data.shouldNudge && data.nudge) {
                await sendToTelegram(`💻 ${data.nudge}`);
                this.lastNudgeAt = Date.now();
            }
        }
        catch { /* best-effort */ }
    }
    async rewriteCommitMessage(diff) {
        const res = await callLLM([{
                role: 'user',
                content: `Rewrite this commit based on the diff. Output a single conventional commit message only.\n\nDiff:\n${diff.slice(0, 3000)}`,
            }]);
        return res.content.trim();
    }
}
//# sourceMappingURL=dev-assistant.js.map