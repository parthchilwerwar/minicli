import { newsAgent } from './news.js';
import { callLLM } from '../llm.js';

// ─── Sub-Agent Trigger Definitions ───────────────────────────────────────────

interface SubAgentTrigger {
  keywords: string[];
  agent: string;
  confidence: number;
}

const SUB_AGENT_TRIGGERS: SubAgentTrigger[] = [
  {
    keywords: ['news', 'what happened', 'latest', 'today in', 'headlines'],
    agent: 'news',
    confidence: 0.7,
  },
  {
    keywords: ['price', 'bitcoin', 'btc', 'eth', 'crypto', 'stock', 'market'],
    agent: 'market',
    confidence: 0.8,
  },
  {
    keywords: ['tweet', 'post this', 'linkedin', 'write a thread', 'make a post'],
    agent: 'content',
    confidence: 0.9,
  },
  {
    keywords: ['remind me', 'todo', 'task', 'remember', "don't forget", 'schedule'],
    agent: 'life-os',
    confidence: 0.8,
  },
  {
    keywords: ['github', 'pr', 'commit', 'issue', 'bug bounty', 'finding'],
    agent: 'dev',
    confidence: 0.8,
  },
  {
    keywords: ['hackathon', 'internship', 'opportunity', 'apply', 'bounty program'],
    agent: 'opportunity',
    confidence: 0.8,
  },
];

// ─── Router ──────────────────────────────────────────────────────────────────

interface RouteResult {
  triggered: boolean;
  agent?: string;
  response?: string;
}

export async function routeToSubAgent(message: string): Promise<RouteResult> {
  const lc = message.toLowerCase();

  // Find the best matching trigger
  let bestMatch: SubAgentTrigger | null = null;
  let bestScore = 0;

  for (const trigger of SUB_AGENT_TRIGGERS) {
    const matchedKeywords = trigger.keywords.filter((kw) => lc.includes(kw));
    if (matchedKeywords.length === 0) continue;

    // Score = (matched keywords / total keywords) * confidence
    const score = (matchedKeywords.length / trigger.keywords.length) * trigger.confidence;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = trigger;
    }
  }

  // Threshold: need at least one keyword match
  if (!bestMatch || bestScore < 0.1) {
    return { triggered: false };
  }

  // Route to the matched agent
  switch (bestMatch.agent) {
    case 'news': {
      const response = await newsAgent.handle(message);
      return { triggered: true, agent: 'news', response };
    }

    // Market, content, life-os, dev, opportunity fall through
    // to the main agent loop with a hint about which sub-agent
    // should handle it. The main agent already handles these
    // via the existing intercept system.
    default:
      return { triggered: false };
  }
}
