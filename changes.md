You are a senior TypeScript engineer doing a focused upgrade to my existing **minicli** project — a personal CLI + Telegram bot daemon.

**STRICT RULES:**
- DO NOT rewrite existing files from scratch unless told to
- Every file stays under 200 lines
- Strict TypeScript, no `any`, Zod everywhere  
- Output COMPLETE content of every new or modified file
- Model: `openrouter/elephant-alpha` via OpenRouter (`https://openrouter.ai/api/v1`)
- No explanations between files, no questions, full working code only

---

## Change 1: Replace Localtunnel with Cloudflare Tunnel

### Remove localtunnel entirely

Delete localtunnel from package.json. Remove all localtunnel code from `src/web-server.ts`.

### Add Cloudflare Quick Tunnel

Cloudflare Quick Tunnel needs no account, no config file, no login.
It works by spawning the `cloudflared` binary as a child process.

```typescript
// src/tunnel.ts (NEW FILE)

import { spawn, ChildProcess } from 'child_process'

let tunnelProcess: ChildProcess | null = null
let publicUrl: string | null = null

export async function startCloudflaredTunnel(port: number): Promise<string> {
  // Spawn: cloudflared tunnel --url http://localhost:{port}
  // Parse stdout for the line containing "trycloudflare.com"
  // That line contains the public URL
  // Timeout after 15 seconds if URL not found
  // Store process reference for cleanup

  return new Promise((resolve, reject) => {
    tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const timeout = setTimeout(() => reject(new Error('tunnel timeout')), 15000)

    const handleOutput = (data: Buffer) => {
      const line = data.toString()
      const match = line.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/)
      if (match) {
        clearTimeout(timeout)
        publicUrl = match[0]
        resolve(publicUrl)
      }
    }

    tunnelProcess.stdout?.on('data', handleOutput)
    tunnelProcess.stderr?.on('data', handleOutput)  // cloudflared logs to stderr
    tunnelProcess.on('error', reject)
  })
}

export async function stopTunnel(): Promise<void> {
  tunnelProcess?.kill()
  tunnelProcess = null
  publicUrl = null
}

export function getTunnelUrl(): string | null {
  return publicUrl
}
```

**Important:** `cloudflared` must be installed on the system.
Add install instructions to README:
```bash
# Linux/Ubuntu (DigitalOcean)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# macOS
brew install cloudflare/cloudflare/cloudflared
```

Update `src/daemon.ts` to use `startCloudflaredTunnel(7654)` instead of localtunnel.
Update `src/web-server.ts` to remove all localtunnel imports and calls.

---

## Change 2: Message Command Queue

### New file: `src/queue.ts`

**Problem:** If two Telegram messages arrive at the same time, both hit the agent loop simultaneously, corrupting conversation state and wasting tokens.

**Fix:** A simple FIFO queue that processes one message at a time.

```typescript
// src/queue.ts

interface QueuedMessage {
  id: string
  chatId: number
  message: string
  timestamp: Date
  resolve: (response: string) => void
  reject: (err: Error) => void
}

export class MessageQueue {
  private queue: QueuedMessage[] = []
  private processing = false

  async enqueue(chatId: number, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: crypto.randomUUID(),
        chatId,
        message,
        timestamp: new Date(),
        resolve,
        reject
      })
      this.processNext()
    })
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    const item = this.queue.shift()!
    try {
      // Call supervisor with the message
      const supervisor = getSupervisor()
      const response = await supervisor.process(item.message, { chatId: item.chatId })
      item.resolve(response)
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.processing = false
      this.processNext()  // process next in queue
    }
  }

  get length(): number { return this.queue.length }
  get isProcessing(): boolean { return this.processing }
}

// Singleton
export const messageQueue = new MessageQueue()
```

Update `src/telegram.ts`:
- Replace direct `supervisor.process()` call with `messageQueue.enqueue(chatId, message)`
- While processing: show "⏳ thinking..." message
- If queue has items waiting: append `(+{n} queued)` to the thinking message

---

## Change 3: Knowledge Graph Memory

### Replace flat JSON memory with a lightweight knowledge graph

### New file: `src/knowledge-graph.ts`

Instead of storing memories as flat JSON files, store them as nodes with typed relationships. This makes memory search smarter and cheaper (less tokens to LLM).

```typescript
// src/knowledge-graph.ts

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'person', 'project', 'task', 'habit', 'preference',
    'fact', 'conversation', 'research', 'finding', 'goal'
  ]),
  label: z.string(),          // short name/title
  content: z.string(),        // full content
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  accessCount: z.number(),    // how often this node is retrieved
  lastAccessed: z.string()
})

const EdgeSchema = z.object({
  id: z.string(),
  from: z.string(),           // node id
  to: z.string(),             // node id
  relation: z.enum([
    'related_to', 'part_of', 'blocks', 'depends_on',
    'led_to', 'contradicts', 'updates', 'references'
  ]),
  weight: z.number()          // 0-1, strength of relationship
})

const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  lastUpdated: z.string()
})

type Node = z.infer<typeof NodeSchema>
type Edge = z.infer<typeof EdgeSchema>

export class KnowledgeGraph {
  private graphPath = path.join(os.homedir(), '.minicli', 'graph.json')
  private graph: { nodes: Node[], edges: Edge[] } = { nodes: [], edges: [] }

  async load(): Promise<void>
  // Load graph.json from disk

  async save(): Promise<void>
  // Write graph.json to disk

  async addNode(node: Omit<Node, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessed'>): Promise<Node>
  // Add node, auto-detect edges to existing nodes by tag overlap + content similarity
  // Save after adding

  async addEdge(from: string, to: string, relation: Edge['relation'], weight?: number): Promise<void>

  async search(query: string, limit = 10): Promise<Node[]>
  // Score nodes by: tag match + label match + content substring
  // Boost score by accessCount (frequently accessed = more relevant)
  // Return top N, update accessCount + lastAccessed for returned nodes

  async getRelated(nodeId: string, depth = 1): Promise<Node[]>
  // Follow edges from a node up to {depth} hops
  // Returns all connected nodes

  async getByType(type: Node['type']): Promise<Node[]>

  async prune(olderThanDays: number, types: Node['type'][]): Promise<number>
  // Delete nodes older than N days matching types
  // Remove orphaned edges
  // Return count deleted

  async summarize(): Promise<string>
  // Returns: "X nodes (Y tasks, Z projects, W facts) | X edges"
  // Used for startup UI and /memory stats
}

export const graph = new KnowledgeGraph()
```

**Update all memory operations** across agents to use `graph.addNode()` and `graph.search()` instead of flat JSON.

**LLM context optimization:**
Before every LLM call, instead of dumping all recent memories, do:
```typescript
// Get only what's relevant to the current message
const relevant = await graph.search(userMessage, 5)
const contextBlock = relevant.map(n => `[${n.type}] ${n.label}: ${n.content}`).join('\n')
// Prepend to system prompt — usually < 500 tokens
```

This keeps token usage low even as memory grows large.

---

## Change 4: Proactive Intelligence Layer

### New file: `src/agents/proactive.ts`

**What it does:**
Monitors the knowledge graph every 4 hours and decides if anything is worth proactively telling you — without you asking.

This is the feature that makes minicli feel alive, not just reactive.

```typescript
export class ProactiveAgent implements Agent {
  name = 'proactive'

  async init(): Promise<void> {
    // Run every 4 hours: "0 */4 * * *"
    // Also run once 2 minutes after daemon starts (warmup check)
  }

  async check(): Promise<void> {
    // Load recent graph nodes (last 48h)
    // Load USER.md patterns
    // Make one LLM call:
    // System: persona + system prompt
    // User: "Review these recent memories and user patterns.
    //        Is there anything worth proactively telling the user right now?
    //        Consider: overdue tasks, pattern breaks, opportunities, stuck projects.
    //        Rules:
    //        - Only send if genuinely useful, not just to say something
    //        - Max 1 proactive message per 4 hours
    //        - Never repeat something sent in last 24h
    //        Output JSON: { shouldSend: boolean, message?: string, reason?: string }"
    // If shouldSend → sendToTelegram(message)
    // Log last sent timestamp to prevent spam
  }
}
```

**Examples of what it sends:**

```
hey — you haven't touched the Pievot deployment issue in 5 days.
it's blocking your launch. want to work through it now?
```

```
your trading watchlist: SOL just moved +6.2%.
you had it flagged as a breakout watch last week.
```

```
ETHIndia registration closes in 3 days.
you mentioned wanting to apply. want me to draft the team description?
```

**Anti-spam rules (enforce strictly):**
- Max 1 proactive message per 4 hours
- Never same topic twice in 24 hours
- Store last sent topics in `~/.minicli/proactive-log.json`
- If user responds negatively ("stop", "not now") → skip that topic for 7 days

---

## Change 5: Async Background Tasks

### New file: `src/async-tasks.ts`

**What it does:**
When a task takes long (browser scraping, research, email triage), don't make the user wait. Start it in background, send result to Telegram when done.

```typescript
interface BackgroundTask {
  id: string
  description: string
  startedAt: string
  status: 'running' | 'done' | 'failed'
  result?: string
}

export class AsyncTaskManager {
  private tasks: Map<string, BackgroundTask> = new Map()

  async run(
    description: string,
    task: () => Promise<string>,
    chatId: number
  ): Promise<string> {
    // 1. Create task entry
    // 2. Send immediate Telegram message: "⚙️ running in background: {description}\nI'll ping you when done."
    // 3. Run task() async (do NOT await here)
    // 4. When task completes → sendToTelegram result
    // 5. Return task ID immediately

    const id = crypto.randomUUID().slice(0, 8)
    const taskEntry: BackgroundTask = {
      id, description,
      startedAt: new Date().toISOString(),
      status: 'running'
    }
    this.tasks.set(id, taskEntry)

    // Fire and forget
    task().then(result => {
      taskEntry.status = 'done'
      taskEntry.result = result
      sendToTelegram(`✅ done [${id}]: ${description}\n\n${result}`)
    }).catch(err => {
      taskEntry.status = 'failed'
      sendToTelegram(`❌ failed [${id}]: ${description}\n${err.message}`)
    })

    return id
  }

  getStatus(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)
  }

  listActive(): BackgroundTask[] {
    return [...this.tasks.values()].filter(t => t.status === 'running')
  }
}

export const asyncTasks = new AsyncTaskManager()
```

**Wire into supervisor:**
When supervisor detects a long-running task (browser automation, deep research, email triage):
```typescript
// Instead of awaiting:
const result = await browserAgent.scrape(url)

// Use async:
const taskId = await asyncTasks.run(`scrape ${url}`, () => browserAgent.scrape(url), chatId)
return `got it, scraping in background. I'll send results when done.`
```

**Telegram command:**
```
/tasks active   → shows running background tasks with IDs
```

---

## Change 6: System Prompt Update for Async + Queue Awareness

Update `src/system-prompt.ts` to add:

```
## Async awareness
- For tasks that take more than 10 seconds (browser, deep research, email scan):
  ALWAYS use background mode. Never make the user wait.
  Say: "on it, running in background — i'll ping you when done"
- For instant tasks (memory search, quick answers, reminders): respond immediately

## Queue awareness  
- If you notice a message saying "(+N queued)", acknowledge it:
  "got a few queued up — working through them"

## Proactive mode
- When sending proactive messages (not responding to user):
  Keep it to 2 lines max. Direct. No fluff.
  Don't explain why you're sending it unless asked.
```

---

## Updated Startup UI

```
 ███╗   ███╗██╗███╗   ██╗██╗ ██████╗██╗     ██╗
 ████╗ ████║██║████╗  ██║██║██╔════╝██║     ██║
 ██╔████╔██║██║██╔██╗ ██║██║██║     ██║     ██║
 ██║╚██╔╝██║██║██║╚██╗██║██║██║     ██║     ██║
 ██║ ╚═╝ ██║██║██║ ╚████║██║╚██████╗███████╗██║
 ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚══════╝╚═╝

 minicli — your life, automated.

 ─────────────────────────────────────
  starting...
 ─────────────────────────────────────
  ✓ Telegram         connected
  ✓ MCP server       :6274
  ✓ Webhooks         :6276
  ✓ Web UI           :7654
  ✓ Cloudflare       https://xxx.trycloudflare.com
  ✓ Knowledge graph  {N} nodes loaded
  ✓ Queue            ready
  ✓ Plugins          {N} loaded
  ✓ Supervisor       online
  ✓ Proactive        every 4h
  ✓ Agents           life-os, dev, trading, opportunity, news
  ✓ Memory reviewer  sunday midnight
 ─────────────────────────────────────
  all systems go. telegram is your interface.
 ─────────────────────────────────────
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/tunnel.ts` | CREATE — cloudflare tunnel |
| `src/queue.ts` | CREATE — message queue |
| `src/knowledge-graph.ts` | CREATE — graph memory |
| `src/agents/proactive.ts` | CREATE — proactive intelligence |
| `src/async-tasks.ts` | CREATE — background task manager |
| `src/web-server.ts` | MODIFY — remove localtunnel, use tunnel.ts |
| `src/daemon.ts` | MODIFY — use cloudflare, start queue + proactive |
| `src/telegram.ts` | MODIFY — route through queue, not supervisor directly |
| `src/memory-store.ts` | MODIFY — delegate to knowledge-graph.ts |
| `src/agents/memory-reviewer.ts` | MODIFY — use graph.prune() + graph.summarize() |
| `src/system-prompt.ts` | MODIFY — add async + queue awareness |
| `src/agents/registry.ts` | MODIFY — register proactive agent |
| `package.json` | MODIFY — remove localtunnel |
| `README.md` | EXTEND — cloudflared install instructions |

---

## Output Order

`tunnel.ts` → `queue.ts` → `knowledge-graph.ts` → `async-tasks.ts` → `agents/proactive.ts` → `web-server.ts` → `daemon.ts` → `telegram.ts` → `memory-store.ts` → `system-prompt.ts` → `agents/registry.ts` → `package.json` → `README.md`

No explanations. No questions. Full code only.