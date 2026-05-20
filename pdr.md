You are a senior TypeScript engineer. Build a personal agentic CLI called "minicli" from scratch. Delete any existing Python files. This is a full rewrite in TypeScript.

## Stack
- Runtime: Node.js 20+
- Language: TypeScript (strict mode, ESM)
- CLI framework: commander
- UI: chalk, ora, cli-table3
- Validation: zod
- Git: simple-git
- AI: OpenRouter API (fetch, no SDK needed)
- Model: google/gemma-2-9b-it:free (default, overridable via --model flag or OPENROUTER_MODEL env)
- Notes storage: plain JSON at ~/.minicli/notes.json
- Chat history: plain JSON at ~/.minicli/history.json
- Config: ~/.minicli/config.json + .env for OPENROUTER_API_KEY

## Project structure to create

minicli/
├── src/
│   ├── index.ts          ← commander entry, registers all subcommands
│   ├── agent.ts          ← agentic loop: sends messages to OpenRouter, handles tool_calls in response, dispatches to tools, loops until done or max_steps=10
│   ├── llm.ts            ← OpenRouter fetch wrapper, streaming support, tool schema formatting
│   ├── tools/
│   │   ├── registry.ts   ← exports ALL_TOOLS array of ToolDefinition
│   │   ├── shell.ts      ← run_shell tool: executes shell commands, SAFETY: blocks rm -rf, format, shutdown; shows preview + requires y/n confirm
│   │   ├── files.ts      ← read_file, write_file, list_dir tools
│   │   ├── git.ts        ← git_status, git_log, git_diff, git_stats tools using simple-git
│   │   ├── search.ts     ← web_search tool: DuckDuckGo HTML scrape, no API key, returns top 5 results
│   │   └── notes.ts      ← save_note, list_notes, search_notes tools
│   ├── memory.ts         ← load/save chat history (last 20 turns), load/save notes
│   ├── ui.ts             ← chalk helpers: success(), error(), info(), streamPrint(), confirmPrompt()
│   └── config.ts         ← loads .env + config.json, exports getModel(), getApiKey()
├── bin/
│   └── mini.js           ← #!/usr/bin/env node  →  import('../dist/index.js')
├── .env.example          ← OPENROUTER_API_KEY=
├── package.json          ← name: minicli, bin: { mini: ./bin/mini.js }, scripts: build/dev/start
└── tsconfig.json         ← target ES2022, module NodeNext, strict true, outDir dist

## Commands to implement

### `mini` (default, no subcommand)
- Show welcome banner: model name, note count, last commit hash+message
- Then drop into REPL chat loop (same as `mini chat`)

### `mini chat`
- Interactive REPL loop
- On each user message: inject relevant notes as context, send to agent.ts agentic loop
- Agent can call tools automatically (shell, files, git, search, notes)
- Stream response token by token using chalk green
- /help, /clear, /history, /notes, /exit as slash commands inside REPL
- Persist history across sessions

### `mini ask "<question>"`
- One-shot. Supports stdin pipe: cat file.ts | mini ask "explain this"
- Inject notes context, run agent loop once, print streamed response

### `mini git`
- Show a formatted git dashboard using simple-git:
  - Current branch + upstream
  - Last 5 commits: hash (7 chars), author, date (relative), message
  - Changed files (git status --short)
  - Insertions/deletions summary from git diff --stat HEAD~1
  - Print with cli-table3, no AI needed

### `mini git log [--n <number>]`
- Print last N commits (default 10) as a clean table
- Columns: #, hash, message (truncated 60 chars), author, date

### `mini git diff`
- Run git diff HEAD, feed to AI with prompt: "Explain what changed in this diff concisely"
- Stream the explanation

### `mini note "<text>" [--tag <tag>]`
- Call save_note tool directly (skip agent loop for speed)
- AI auto-generates 1-3 tags if --tag not provided (one quick llm call)
- Print: ✓ Note saved [id] #tag1 #tag2

### `mini notes [--tag <tag>] [--search <query>]`
- Print notes as table: id, text (truncated), tags, date
- Filter by tag or keyword

### `mini shell "<description>"`
- One agent call: "Generate a shell command for: <description>. Reply with ONLY the command."
- Show generated command, ask y/n to run it
- If y: execute with child_process, stream output

### `mini explain` (stdin only)
- cat file | mini explain
- Reads stdin, sends to AI: "Explain this clearly and concisely"
- Stream response

### `mini history`
- Print last 10 chat turns from history.json as a simple table

### `mini clear`
- Delete history.json contents (keep file), confirm first

## Agentic loop (agent.ts) — IMPORTANT

Implement a proper tool-use loop:

```typescript
async function runAgent(userMessage: string, tools: ToolDefinition[], history: Message[]): Promise<string> {
  const messages = [...history, { role: 'user', content: userMessage }]
  let steps = 0
  
  while (steps < 10) {
    const response = await callLLM(messages, tools)  // returns {content, tool_calls?}
    
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return response.content  // done
    }
    
    // execute each tool call
    for (const toolCall of response.tool_calls) {
      const tool = tools.find(t => t.name === toolCall.function.name)
      const args = JSON.parse(toolCall.function.arguments)
      const result = await tool.execute(args)
      
      messages.push({ role: 'assistant', tool_calls: [toolCall] })
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: String(result) })
    }
    
    steps++
  }
  
  return 'Max steps reached.'
}
```

## OpenRouter API (llm.ts)

Use fetch to POST to https://openrouter.ai/api/v1/chat/completions
Headers: Authorization: Bearer ${OPENROUTER_API_KEY}, Content-Type: application/json, HTTP-Referer: minicli
Body: { model, messages, tools (formatted as OpenAI tool schema), stream: true }
For streaming: read response body as a stream, parse SSE data: lines, yield content deltas
For tool calls: accumulate tool_call chunks across stream events, reconstruct full tool_calls array

## Tool schema format (Zod → OpenAI format)

Each tool in registry.ts exports:
```typescript
export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodObject<any>  // converted to JSON schema for API
  execute: (args: any) => Promise<string>  // always returns string result
}
```
Use zod-to-json-schema to convert Zod schemas to JSON Schema for the API call.

## Git tools (tools/git.ts) — detail

Use simple-git (npm: simple-git). Implement:

- git_status: returns branch, staged/unstaged files, untracked count
- git_log: accepts { n: number }, returns last N commits as formatted string
- git_diff: returns output of git diff HEAD (truncated to 4000 chars)  
- git_stats: returns insertions+deletions of last commit, committer, timestamp

These are callable both by the agent AND by the `mini git` command directly.

## Notes (tools/notes.ts + memory.ts)

Store at ~/.minicli/notes.json as array of:
{ id: string (8 char uuid), text: string, tags: string[], ts: number, kind: 'note' }

Functions: loadNotes(), saveNote(note), deleteNote(id), searchNotes(query), filterByTag(tag)

## Safety (tools/shell.ts)

BLOCKED_PATTERNS = ['rm -rf /', 'format c:', 'shutdown', 'del /f /s', ':(){ :|:& };:']
Before any shell execution: check command against blocked patterns, if match → print error, abort.
For all other shell commands: show the command in yellow, ask "Run this? (y/N)", only execute if confirmed.

## UI (ui.ts)

- success(msg): chalk.green('✓') + msg
- error(msg): chalk.red('✗') + msg  
- info(msg): chalk.dim('→') + msg
- warn(msg): chalk.yellow('⚠') + msg
- streamPrint(chunk): process.stdout.write(chalk.green(chunk))
- confirmPrompt(msg): uses inquirer, returns boolean
- banner(model, noteCount, lastCommit): box-style welcome using chalk

## package.json dependencies

```json
{
  "dependencies": {
    "commander": "^12",
    "chalk": "^5",
    "ora": "^8",
    "cli-table3": "^0.6",
    "simple-git": "^3",
    "zod": "^3",
    "zod-to-json-schema": "^3",
    "inquirer": "^10",
    "dotenv": "^16",
    "uuid": "^10"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/inquirer": "^9",
    "@types/uuid": "^10",
    "tsx": "^4"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js"
  }
}
```

## Setup instructions to generate

Create a README.md with:
1. npm install
2. cp .env.example .env → add OPENROUTER_API_KEY
3. npm run build
4. npm link  (makes `mini` available globally)
5. mini

## Rules
- All files in src/ must be TypeScript with explicit types, no `any` except where unavoidable
- No Python files at all — delete them if they exist
- No Ollama dependency — only OpenRouter
- No Telegram, no Chrome extension, no clipboard watcher
- Keep each file under 200 lines — split if longer
- Every tool must handle errors gracefully and return a string error message (never throw from execute())
- Streaming must work — don't buffer the full response