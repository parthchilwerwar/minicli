# minicli

> Your life, automated.

A personal AI agent that lives in your terminal and Telegram. One command boots a full daemon — agents, memory, tools, web UI, and public tunneling. Built with TypeScript, powered by OpenRouter.

---

## What it does

- **Telegram interface** — send commands or plain English, get things done
- **6 autonomous agents** — run on schedules: morning briefs, dev check-ins, market updates, opportunity digests, proactive insights, memory cleanup
- **42 tools** — files, shell, GitHub, Gmail, Google Calendar, TickTick, Obsidian, web search, news
- **Persistent memory** — knowledge graph + conversation history, auto-linked and searchable
- **Public web UI** — accessible from anywhere via Cloudflare tunnel

---

## Prerequisites

- Node.js 18+
- A [Telegram bot token](https://t.me/BotFather)
- An [OpenRouter API key](https://openrouter.ai) (free tier works)
- `cloudflared` installed ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))

---

## Setup

**1. Clone and install**

```bash
git clone https://github.com/your-user/minicli.git
cd minicli
npm install
npm install -g .
```

**2. Install cloudflared**

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# Windows
winget install cloudflare.cloudflared
```

**3. Configure environment**

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_ALLOWED_USER_ID` | Your Telegram user ID (get it from @userinfobot) |

**4. Build and run**

```bash
npm run build
mini
```

You should see all services come online in your terminal. **Your Telegram bot is now live.**

---

## Optional integrations

Set these in `.env` to unlock more features:

| Variable | Feature |
|----------|---------|
| `GITHUB_TOKEN` | PR/issue/CI tracking |
| `TICKTICK_ACCESS_TOKEN` | Task management |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` | Gmail + Google Calendar |
| `VAULT_PATH` | Obsidian vault access |
| `OPENROUTER_MODEL` | Override the default LLM |

**Gmail/Calendar OAuth:** Run `mini` on first boot — it will walk you through browser authentication and auto-fill your refresh token.

---

## Usage

Everything goes through your **Telegram bot**. Type commands or just talk naturally.

### Commands

| Command | What it does |
|---------|-------------|
| `/today` | Daily dashboard — calendar, tasks, weather |
| `/notes` | Your 5 most recent notes |
| `/vault` | Obsidian vault file tree |
| `/find <query>` | Search files across all directories |
| `/read <filename>` | Read a vault note |
| `/gmail` | Email overview |
| `/gmail search <q>` | Search emails |
| `/news [topic]` | News briefing |
| `/memory` | Recent conversation memories |
| `/search <query>` | Search memory |
| `/status` | Full daemon status |
| `/web` | Your public web UI link |
| `/help` | All commands |

### Natural language examples

Just type — minicli routes to the right agent automatically:

```
"what's bitcoin at?"          → Trading agent
"remind me to submit the PR"  → Life OS (task capture)
"any open PRs?"               → Dev agent
"tweet this: just shipped v2" → Content generator
"any hackathons this week?"   → Opportunity agent
"latest AI news"              → News agent
```

**Smart extras:**
- Paste a URL → auto-analyzed and saved to memory
- `tweet this:` / `linkedin post about` / `readme for` → content generated instantly

---

## Agents

Agents run automatically on a schedule and can also be triggered via chat.

| Agent | Schedule | What it does |
|-------|----------|-------------|
| 🌅 Life OS | 7am + 11pm | Morning brief, night review, task capture |
| 💻 Dev & Builder | 9:30am daily | GitHub PRs, CI status, issues |
| 📈 Trading + Research | 8am weekdays | Crypto prices, market alerts, URL analysis |
| 🎯 Opportunity + Content | Monday 9am | Hackathons, internships, content generation |
| 🧠 Proactive | Every 4h | Autonomous insights from your knowledge graph |
| 🗂️ Memory Reviewer | Sunday midnight | Prunes stale memories, reports graph stats |

Customize schedules via cron variables in `.env` (e.g. `LIFE_OS_MORNING_CRON=0 7 * * *`).

---

## Memory

minicli stores everything in `~/.minicli/`:

- **`graph.json`** — knowledge graph with typed nodes (tasks, people, projects, facts) and edges
- **`memories/`** — full conversation history, timestamped and searchable
- **`USER.md`** — auto-generated persona, updated as you chat, injected into every LLM call

---

## Running in production

**With PM2:**
```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

**With systemd (Linux):** create `/etc/systemd/system/minicli.service`, point `ExecStart` at `dist/index.js`, set `EnvironmentFile` to your `.env`, then `systemctl enable --now minicli`.

---

## Security

- Set `TELEGRAM_ALLOWED_USER_ID` — only you can talk to your bot
- Never commit `.env` to git
- Never share `~/.minicli/` — it contains all your data and tokens
- The LLM has shell and file access — review destructive actions before confirming

---

## LLM

Uses [OpenRouter](https://openrouter.ai) with automatic fallback:

- **Primary:** `google/gemma-4-31b-it:free`
- **Fallback:** `qwen/qwen3-next-80b-a3b-instruct:free` (kicks in on rate limit)
- Override with `OPENROUTER_MODEL` in `.env`

---

## License

MIT