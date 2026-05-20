import { callLLM } from '../llm.js';
import { webSearchTool } from '../tools/search.js';
import { newsFetchRssTool } from '../tools/news.js';

// ─── News Agent ──────────────────────────────────────────────────────────────

const NEWS_AGENT_PROMPT = `You are a news anchor inside minicli. Your name is "the feed".
When presenting news, you talk like a chill news guy —
not a robot reading headlines, but a friend telling you what happened.
Like: "so basically what went down today is..."
Keep it conversational, short, and interesting.
Filter out boring corporate PR fluff.
Only share things that actually matter.`;

const RSS_FEEDS = [
  'https://hnrss.org/frontpage',
  'https://techcrunch.com/feed/',
  'https://feeds.arstechnica.com/arstechnica/index',
];

export interface Agent {
  name: string;
  handle(query: string): Promise<string>;
}

export class NewsAgent implements Agent {
  name = 'news';

  async handle(query: string): Promise<string> {
    // 1. Gather headlines from RSS feeds
    const headlines: string[] = [];

    for (const feedUrl of RSS_FEEDS) {
      try {
        const result = await newsFetchRssTool.execute({ url: feedUrl });
        // Extract first 3 items from each feed
        const items = result.split('\n').filter((l) => l.trim()).slice(0, 3);
        headlines.push(...items);
      } catch { /* skip failed feeds */ }
    }

    // 2. Supplement with search if query is specific
    if (query && query.length > 10) {
      try {
        const searchResult = await webSearchTool.execute({
          query: `${query} news today`,
        });
        headlines.push(searchResult.slice(0, 500));
      } catch { /* best-effort */ }
    }

    if (!headlines.length) {
      return "couldn't fetch any news right now. servers might be acting up. try again in a bit.";
    }

    // 3. LLM call with news-specific system prompt
    const headlinesText = headlines.join('\n').slice(0, 3000);
    const userPrompt = `Here are today's headlines:\n${headlinesText}\n\nParth asked: "${query}".\nTell him what's up, casual style. Keep it under 10 lines.`;

    try {
      const response = await callLLM([
        { role: 'system', content: NEWS_AGENT_PROMPT },
        { role: 'user', content: userPrompt },
      ]);
      return response.content || "news feed came up empty. weird.";
    } catch {
      return "LLM call failed for the news summary. try again.";
    }
  }
}

export const newsAgent = new NewsAgent();
