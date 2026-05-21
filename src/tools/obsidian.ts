import { z } from 'zod';
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, basename, resolve } from 'path';
import { getVaultPath } from '../config.js';
import { assertWithin } from './filesystem.js';
import type { ToolDefinition } from './registry.js';

// ─── Config ──────────────────────────────────────────────────────────────────

function vaultPath(): string {
  const p = getVaultPath();
  if (!p) throw new Error('VAULT_PATH (or OBSIDIAN_VAULT_PATH) not set in .env');
  return resolve(p);
}

/** Resolve a user-supplied filename inside the vault. Rejects ../ traversal. */
function safeVaultPath(filename: string, folder?: string): string {
  const vault = vaultPath();
  const name = filename.endsWith('.md') ? filename : `${filename}.md`;
  const target = folder ? join(vault, folder, name) : join(vault, name);
  return assertWithin(vault, target);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function walkMd(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkMd(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SearchParams = z.object({
  query: z.string().describe('Search query text'),
});

const ReadNoteParams = z.object({
  filename: z.string().describe('Note filename (with or without .md)'),
});

const CreateNoteParams = z.object({
  filename: z.string().describe('Note filename'),
  content: z.string().describe('Markdown content'),
  folder: z.string().optional().describe('Subfolder in vault'),
});

const ListRecentParams = z.object({
  limit: z.number().optional().describe('Number of recent notes'),
});

const AppendNoteParams = z.object({
  filename: z.string().describe('Note filename to append to'),
  content: z.string().describe('Content to append'),
});

// ─── Tools ───────────────────────────────────────────────────────────────────

export const obsidianSearchTool: ToolDefinition = {
  name: 'obsidian_search',
  description: 'Full-text search across all .md files in Obsidian vault',
  parameters: SearchParams,
  async execute(args) {
    const { query } = SearchParams.parse(args);
    try {
      const vault = vaultPath();
      const files = await walkMd(vault);
      const queryLower = query.toLowerCase();
      const matches: string[] = [];

      for (const file of files) {
        const content = await readFile(file, 'utf-8');
        if (content.toLowerCase().includes(queryLower)) {
          const rel = relative(vault, file);
          const lines = content.split('\n');
          const matchLine = lines.find((l) => l.toLowerCase().includes(queryLower));
          matches.push(`📄 ${rel}\n   ${matchLine?.trim().slice(0, 100) ?? ''}`);
        }
        if (matches.length >= 15) break;
      }

      if (!matches.length) return `No notes matching "${query}".`;
      return matches.join('\n\n');
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const obsidianReadNoteTool: ToolDefinition = {
  name: 'obsidian_read_note',
  description: 'Read a specific Obsidian note by filename',
  parameters: ReadNoteParams,
  async execute(args) {
    const { filename } = ReadNoteParams.parse(args);
    try {
      const vault = vaultPath();
      const name = filename.endsWith('.md') ? filename : `${filename}.md`;

      // Direct path in vault root \u2014 reject traversal first.
      try {
        const exactPath = safeVaultPath(filename);
        if (existsSync(exactPath)) {
          const content = await readFile(exactPath, 'utf-8');
          return content.slice(0, 8000);
        }
      } catch {
        // path escaped \u2014 fall through to basename search inside the vault
      }

      // Basename search across the vault tree (each result is already inside vault).
      const files = await walkMd(vault);
      const match = files.find((f) => basename(f).toLowerCase() === name.toLowerCase());
      if (!match) return `Note "${filename}" not found.`;
      const content = await readFile(match, 'utf-8');
      return content.slice(0, 8000);
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const obsidianCreateNoteTool: ToolDefinition = {
  name: 'obsidian_create_note',
  description: 'Create a new markdown note in Obsidian vault',
  parameters: CreateNoteParams,
  async execute(args) {
    const { filename, content, folder } = CreateNoteParams.parse(args);
    try {
      const notePath = safeVaultPath(filename, folder);
      const dir = join(notePath, '..');
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      await writeFile(notePath, content, 'utf-8');
      return `Note created: ${relative(vaultPath(), notePath)}`;
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const obsidianListRecentTool: ToolDefinition = {
  name: 'obsidian_list_recent',
  description: 'List recently modified notes in Obsidian vault',
  parameters: ListRecentParams,
  async execute(args) {
    const { limit } = ListRecentParams.parse(args);
    try {
      const vault = vaultPath();
      const files = await walkMd(vault);

      const withStats = await Promise.all(
        files.map(async (f) => {
          const s = await stat(f);
          return { path: relative(vault, f), mtime: s.mtime.getTime() };
        })
      );

      withStats.sort((a, b) => b.mtime - a.mtime);
      const top = withStats.slice(0, limit ?? 10);

      if (!top.length) return 'No notes found in vault.';
      return top.map((f) =>
        `📄 ${f.path}  (${new Date(f.mtime).toLocaleDateString()})`
      ).join('\n');
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const obsidianAppendNoteTool: ToolDefinition = {
  name: 'obsidian_append_note',
  description: 'Append content to an existing Obsidian note',
  parameters: AppendNoteParams,
  async execute(args) {
    const { filename, content } = AppendNoteParams.parse(args);
    try {
      const vault = vaultPath();
      const name = filename.endsWith('.md') ? filename : `${filename}.md`;

      const files = await walkMd(vault);
      const match = files.find((f) => basename(f).toLowerCase() === name.toLowerCase())
        ?? safeVaultPath(filename);

      if (!existsSync(match)) return `Note "${filename}" not found.`;
      const existing = await readFile(match, 'utf-8');
      await writeFile(match, existing + '\n\n' + content, 'utf-8');
      return `Appended to ${relative(vault, match)}.`;
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
