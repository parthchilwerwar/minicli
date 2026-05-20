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
    const res = await fetch(url, {
        headers: { 'User-Agent': 'minicli-news/1.0' },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
        throw new Error(`Feed fetch failed (${res.status}): ${url}`);
    const xml = await res.text();
    return parseRssXml(xml).slice(0, limit);
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