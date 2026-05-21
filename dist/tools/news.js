import { z } from 'zod';
import { quickLLM } from '../llm.js';
// ─── Default RSS Feeds ───────────────────────────────────────────────────────
const DEFAULT_FEEDS = [
    'https://hnrss.org/frontpage',
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://feeds.arstechnica.com/arstechnica/index',
];
function parseRssXml(xml) {
    const items = [];
    const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1] ?? '';
        const titleMatch = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/i.exec(block);
        const linkMatch = /<link><!\[CDATA\[(.*?)\]\]>|<link>(.*?)<\/link>/i.exec(block);
        const title = titleMatch?.[1] ?? titleMatch?.[2] ?? '';
        const link = linkMatch?.[1] ?? linkMatch?.[2] ?? '';
        if (title)
            items.push({ title: title.trim(), link: link.trim() });
    }
    // Also try Atom <entry> format
    if (items.length === 0) {
        const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
        while ((match = entryRegex.exec(xml)) !== null) {
            const block = match[1] ?? '';
            const titleMatch = /<title[^>]*>(.*?)<\/title>/i.exec(block);
            const linkMatch = /<link[^>]*href="([^"]*)"[^>]*\/?>|<link[^>]*>(.*?)<\/link>/i.exec(block);
            const title = titleMatch?.[1] ?? '';
            const link = linkMatch?.[1] ?? linkMatch?.[2] ?? '';
            if (title)
                items.push({ title: title.trim(), link: link.trim() });
        }
    }
    return items;
}
async function fetchFeed(url, limit) {
    assertPublicHttpUrl(url);
    const res = await fetch(url, {
        headers: { 'User-Agent': 'minicli-news/1.0' },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
    });
    if (!res.ok)
        throw new Error(`Feed fetch failed (${res.status}): ${url}`);
    // After redirects, double-check the final URL is still safe — redirects can
    // bounce to 169.254.169.254 / 127.0.0.1 even when the initial host is fine.
    if (res.url)
        assertPublicHttpUrl(res.url);
    const xml = await res.text();
    return parseRssXml(xml).slice(0, limit);
}
// ─── SSRF guard ────────────────────────────────────────────────────────────────────
/**
 * Reject obvious SSRF targets: non-http schemes, loopback, link-local /
 * cloud-metadata, RFC1918 ranges, and IPv6 loopback. We accept the tradeoff
 * of blocking valid hosts that resolve to private IPs — RSS feeds shouldn't.
 */
function assertPublicHttpUrl(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    }
    catch {
        throw new Error(`Invalid URL: ${rawUrl}`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error(`Refusing non-http(s) URL: ${u.protocol}`);
    }
    const host = u.hostname.toLowerCase();
    if (!host)
        throw new Error('Refusing URL with empty host');
    if (host === 'localhost' || host === 'localhost.localdomain' || host.endsWith('.localhost')) {
        throw new Error('Refusing loopback host');
    }
    if (host === '::1' || host === '::' || host === '[::1]')
        throw new Error('Refusing IPv6 loopback');
    // IPv4 numeric
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])];
        if (a === 0)
            throw new Error('Refusing 0.0.0.0/8');
        if (a === 10)
            throw new Error('Refusing 10.0.0.0/8');
        if (a === 127)
            throw new Error('Refusing 127.0.0.0/8');
        if (a === 169 && b === 254)
            throw new Error('Refusing 169.254.0.0/16 (link-local / metadata)');
        if (a === 172 && b >= 16 && b <= 31)
            throw new Error('Refusing 172.16.0.0/12');
        if (a === 192 && b === 168)
            throw new Error('Refusing 192.168.0.0/16');
        if (a >= 224)
            throw new Error('Refusing multicast / reserved range');
    }
    // IPv6 bracketed unique-local / link-local catch-all
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
        throw new Error('Refusing IPv6 private range');
    }
}
// ─── Schemas ─────────────────────────────────────────────────────────────────
const FetchRssParams = z.object({
    url: z.string().url().describe('RSS feed URL'),
    limit: z.number().optional().describe('Max items to return'),
});
const SummariseTodayParams = z.object({
    topics: z.array(z.string()).optional().describe('Topics to focus on'),
});
const SearchHeadlinesParams = z.object({
    query: z.string().describe('Keyword to search headlines for'),
});
// ─── Tools ───────────────────────────────────────────────────────────────────
export const newsFetchRssTool = {
    name: 'news_fetch_rss',
    description: 'Fetch and parse an RSS feed, returning titles and links',
    parameters: FetchRssParams,
    async execute(args) {
        const { url, limit } = FetchRssParams.parse(args);
        try {
            const items = await fetchFeed(url, limit ?? 10);
            if (!items.length)
                return 'No items found in feed.';
            return items.map((i, idx) => `${idx + 1}. ${i.title}\n   ${i.link}`).join('\n\n');
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
export const newsSummariseTodayTool = {
    name: 'news_summarise_today',
    description: 'Fetch multiple news feeds and generate an LLM-summarised briefing',
    parameters: SummariseTodayParams,
    async execute(args) {
        const { topics } = SummariseTodayParams.parse(args);
        const allItems = [];
        for (const feedUrl of DEFAULT_FEEDS) {
            try {
                const items = await fetchFeed(feedUrl, 8);
                allItems.push(...items);
            }
            catch { /* skip failed feeds */ }
        }
        if (!allItems.length)
            return 'Could not fetch any news feeds.';
        const headlines = allItems
            .map((i) => `- ${i.title} (${i.link})`)
            .join('\n');
        const topicFilter = topics?.length
            ? `\nFocus especially on these topics: ${topics.join(', ')}.`
            : '';
        const prompt = `Summarise these news headlines into a clean briefing. Group by theme. Be concise. Use bullet points.${topicFilter}\n\nHeadlines:\n${headlines}`;
        try {
            return await quickLLM(prompt);
        }
        catch (err) {
            return `Headlines fetched but summarisation failed: ${err instanceof Error ? err.message : String(err)}\n\nRaw headlines:\n${headlines.slice(0, 2000)}`;
        }
    },
};
export const newsSearchHeadlinesTool = {
    name: 'news_search_headlines',
    description: 'Search recent headlines across default RSS feeds by keyword',
    parameters: SearchHeadlinesParams,
    async execute(args) {
        const { query } = SearchHeadlinesParams.parse(args);
        const queryLower = query.toLowerCase();
        const allItems = [];
        for (const feedUrl of DEFAULT_FEEDS) {
            try {
                const items = await fetchFeed(feedUrl, 15);
                allItems.push(...items);
            }
            catch { /* skip */ }
        }
        const matches = allItems.filter((i) => i.title.toLowerCase().includes(queryLower));
        if (!matches.length)
            return `No headlines matching "${query}".`;
        return matches.map((i, idx) => `${idx + 1}. ${i.title}\n   ${i.link}`).join('\n\n');
    },
};
//# sourceMappingURL=news.js.map