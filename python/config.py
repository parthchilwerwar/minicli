"""
minicli agent server configuration.
Loads environment from the project root .env file.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (one level up from python/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"
load_dotenv(_ENV_FILE)

# ── OpenRouter ──────────────────────────────────────────────────────────────
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
PRIMARY_MODEL: str = os.getenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
FALLBACK_MODEL: str = "qwen/qwen3-next-80b-a3b-instruct:free"

# ── Network ─────────────────────────────────────────────────────────────────
BRIDGE_PORT: int = int(os.getenv("BRIDGE_PORT", "6275"))
BRIDGE_SECRET: str = os.getenv("BRIDGE_SECRET", "")
DEV_BYPASS_AUTH: bool = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"
AGENT_PORT: int = int(os.getenv("AGENT_PORT", "6280"))

# ── Paths ───────────────────────────────────────────────────────────────────
MINICLI_DIR: Path = Path.home() / ".minicli"
CHROMADB_DIR: Path = MINICLI_DIR / "chromadb"
PERSONA_DIR: Path = MINICLI_DIR / "persona"
MEMORIES_DIR: Path = MINICLI_DIR / "memories"
GRAPH_FILE: Path = MINICLI_DIR / "graph.json"

VAULT_PATH: str = os.getenv("VAULT_PATH", "")
DESKTOP_PATH: str = os.getenv("DESKTOP_PATH", "")
DOWNLOADS_PATH: str = os.getenv("DOWNLOADS_PATH", "")
NOTES_PATH: str = os.getenv("NOTES_FOLDER_PATH", "")

# ── Telegram ────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ALLOWED_USER_ID: str = os.getenv("TELEGRAM_ALLOWED_USER_ID", "")

# ── Agents ──────────────────────────────────────────────────────────────────
LIFE_OS_NAME: str = os.getenv("LIFE_OS_NAME", "User")
TRACKED_ASSETS: list[str] = [
    a.strip() for a in os.getenv("TRACKED_ASSETS", "bitcoin,ethereum").split(",") if a.strip()
]

# ── Ensure dirs ─────────────────────────────────────────────────────────────
MINICLI_DIR.mkdir(parents=True, exist_ok=True)
CHROMADB_DIR.mkdir(parents=True, exist_ok=True)
PERSONA_DIR.mkdir(parents=True, exist_ok=True)
