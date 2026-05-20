import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

const SearchParams = z.object({
  query: z.string().describe('The search query'),
});

interface SearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

// ─── DuckDuckGo Instant Answer API ───────────────────────────────────────────

async function ddgInstant(query: string): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'minicli/1.0 (personal CLI assistant)' },
  });
  if (!res.ok) throw new Error(`DDG instant: ${res.status}`);

  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?:  string;
    AbstractSource?: string;
    RelatedTopics?: Array<{
      Text?: string;
      FirstURL?: string;
      Topics?: Array<{ Text?: string; FirstURL?: string }>;
    }>;
    Results?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const out: SearchResult[] = [];

  // Main abstract (e.g. Wikipedia summary)
  if (data.AbstractText && data.AbstractURL) {
    out.push({
      title:   data.AbstractSource ?? 'Abstract',
      url:     data.AbstractURL,
      snippet: data.AbstractText,
    });
  }

  // Direct results
  for (const r of data.Results ?? []) {
    if (r.FirstURL && r.Text && out.length < 5) {
      out.push({ title: r.Text.slice(0, 80), url: r.FirstURL, snippet: r.Text });
    }
  }

  // Related topics
  for (const t of data.RelatedTopics ?? []) {
    if (out.length >= 5) break;
    if (t.FirstURL && t.Text) {
      out.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
    }
    // Nested topic groups
    for (const sub of t.Topics ?? []) {
      if (out.length >= 5) break;
      if (sub.FirstURL && sub.Text) {
        out.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL, snippet: sub.Text });
      }
    }
  }

  return out;
}

// ─── DuckDuckGo HTML scrape (fallback) ───────────────────────────────────────

async function ddgHtml(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept:       'text/html',
    },
  });
  if (!res.ok) throw new Error(`DDG html: ${res.status}`);
  const html  = await res.text();
  const out: SearchResult[] = [];

  // Extract result links
  const titleRe   = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*)<\/a>/gi;

  const titles:   Array<[string, string]> = [];
  const snippets: string[]                = [];

  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null && titles.length < 6) {
    titles.push([m[1] ?? '', m[2]?.trim() ?? '']);
  }
  while ((m = snippetRe.exec(html)) !== null && snippets.length < 6) {
    snippets.push((m[1] ?? '').replace(/<[^>]+>/g, '').trim());
  }

  for (let i = 0; i < Math.min(titles.length, 5); i++) {
    const [url2, title] = titles[i] ?? ['', ''];
    out.push({ title, url: url2, snippet: snippets[i] ?? '' });
  }

  return out;
}

// ─── Tool definition ─────────────────────────────────────────────────────────

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for current information, news, facts, or any topic. ' +
    'Always use this when the user asks about recent events or anything you might not know.',
  parameters: SearchParams,

  async execute(args) {
    const { query } = SearchParams.parse(args);

    try {
      // Try instant answer API first; fall back to HTML scrape
      let results = await ddgInstant(query);
      if (results.length === 0) results = await ddgHtml(query);
      if (results.length === 0) return `No results found for: ${query}`;

      return results
        .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`)
        .join('\n\n');
    } catch (err: unknown) {
      // Last-resort fallback
      try {
        const results = await ddgHtml(query);
        if (results.length === 0) return `No results found for: ${query}`;
        return results
          .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`)
          .join('\n\n');
      } catch {
        return `Search error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  },
};
