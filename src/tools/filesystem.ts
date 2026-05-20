import { z } from 'zod';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative, extname, basename } from 'path';
import { getVaultPath, getDesktopPath, getDownloadsPath, getNotesPath } from '../config.js';
import type { ToolDefinition } from './registry.js';

// ─── Safety ──────────────────────────────────────────────────────────────────

const BINARY_EXTS = new Set([
  '.png','.jpg','.jpeg','.gif','.bmp','.ico','.webp','.svg',
  '.mp3','.mp4','.avi','.mov','.wav','.flac','.ogg',
  '.zip','.tar','.gz','.rar','.7z','.exe','.dll','.so','.dylib',
  '.pdf','.docx','.xlsx','.pptx','.woff','.woff2','.ttf','.otf',
]);

const MAX_READ_BYTES = 50 * 1024; // 50KB

function getAllowedRoots(): string[] {
  return [getVaultPath(), getNotesPath(), getDesktopPath(), getDownloadsPath()]
    .filter(Boolean)
    .map((p) => resolve(p));
}

function assertAllowed(targetPath: string): string {
  const resolved = resolve(targetPath);
  const roots = getAllowedRoots();
  if (roots.length === 0) throw new Error('No allowed directories configured in .env');
  const ok = roots.some((r) => resolved.startsWith(r));
  if (!ok) throw new Error('Access denied: path outside allowed directories');
  return resolved;
}

function isBinary(filePath: string): boolean {
  return BINARY_EXTS.has(extname(filePath).toLowerCase());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function walkDir(dir: string, depth: number, current = 0): Promise<string[]> {
  if (current >= depth) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    const prefix = '  '.repeat(current);
    if (e.isDirectory()) {
      results.push(`${prefix}📁 ${e.name}/`);
      results.push(...await walkDir(full, depth, current + 1));
    } else {
      results.push(`${prefix}📄 ${e.name}`);
    }
  }
  return results;
}

async function walkMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) results.push(...await walkMdFiles(full));
    else if (e.name.endsWith('.md')) results.push(full);
  }
  return results;
}

async function findFiles(rootDir: string, pattern: string): Promise<string[]> {
  const results: string[] = [];
  const q = pattern.toLowerCase();
  const MAX_RESULTS = 25;
  const MAX_DIRS    = 500; // hard cap on directories scanned
  let dirsScanned   = 0;

  // BFS queue of directories to scan
  const queue: string[] = [rootDir];

  while (queue.length > 0 && results.length < MAX_RESULTS && dirsScanned < MAX_DIRS) {
    // Fan out the current BFS level in parallel (up to 8 dirs at once)
    const batch = queue.splice(0, 8);
    dirsScanned += batch.length;

    const batchResults = await Promise.all(
      batch.map(async (dir) => {
        try {
          return await readdir(dir, { withFileTypes: true });
        } catch {
          return [];
        }
      })
    );

    for (let i = 0; i < batch.length; i++) {
      const dir     = batch[i]!;
      const entries = batchResults[i]!;
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = join(dir, e.name);
        if (e.name.toLowerCase().includes(q)) {
          results.push(full);
          if (results.length >= MAX_RESULTS) return results;
        }
        if (e.isDirectory()) queue.push(full);
      }
    }
  }

  return results;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const PathParam      = z.object({ path: z.string().describe('Directory or file path') });
const ReadParam      = z.object({ path: z.string().describe('File path to read') });
const FindParam      = z.object({
  query:    z.string().describe('Name pattern to search for'),
  searchIn: z.enum(['vault', 'desktop', 'downloads', 'all']).optional().describe('Where to search'),
});
const StructureParam = z.object({
  path:  z.string().describe('Root directory'),
  depth: z.number().optional().describe('Max depth (default 3)'),
});
const VaultFileParam = z.object({ filename: z.string().describe('Note filename') });
const VaultQueryParam = z.object({ query: z.string().describe('Search text') });
const EmptyParam     = z.object({});

// ─── Tools ───────────────────────────────────────────────────────────────────

export const fsListDirTool: ToolDefinition = {
  name: 'fs_list_dir',
  description: 'List contents of an allowed directory',
  parameters: PathParam,
  async execute(args) {
    const { path } = PathParam.parse(args);
    const safe = assertAllowed(path);
    if (!existsSync(safe)) return `ERROR: Path not found: ${path}`;
    const entries = await readdir(safe, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`)
      .join('\n') || '(empty directory)';
  },
};

export const fsReadFileTool: ToolDefinition = {
  name: 'fs_read_file',
  description: 'Read a text file from allowed directories (max 50KB)',
  parameters: ReadParam,
  async execute(args) {
    const { path } = ReadParam.parse(args);
    const safe = assertAllowed(path);
    if (!existsSync(safe)) return `ERROR: File not found: ${path}`;
    if (isBinary(safe)) return `ERROR: Cannot read binary file: ${basename(safe)}`;
    const s = await stat(safe);
    if (s.size > MAX_READ_BYTES) return `ERROR: File too large (${Math.round(s.size / 1024)}KB > 50KB limit)`;
    return await readFile(safe, 'utf-8');
  },
};

export const fsFindTool: ToolDefinition = {
  name: 'fs_find',
  description: 'Find files/folders matching a name pattern across allowed paths',
  parameters: FindParam,
  async execute(args) {
    const { query, searchIn } = FindParam.parse(args);
    const dirs: string[] = [];
    if (!searchIn || searchIn === 'all') dirs.push(...getAllowedRoots());
    else if (searchIn === 'vault')     { const v = getVaultPath();     if (v) dirs.push(resolve(v)); }
    else if (searchIn === 'desktop')   { const d = getDesktopPath();   if (d) dirs.push(resolve(d)); }
    else if (searchIn === 'downloads') { const d = getDownloadsPath(); if (d) dirs.push(resolve(d)); }

    if (!dirs.length) return 'No search directories configured.';
    // Search all root dirs in parallel for speed
    const perRoot = await Promise.all(
      dirs.filter((d) => existsSync(d)).map((d) => findFiles(d, query))
    );
    const all = perRoot.flat().slice(0, 25);
    if (!all.length) return `No files matching "${query}".`;
    return all.map((f) => {
      const root = getAllowedRoots().find((r) => f.startsWith(r));
      return root ? `📄 ${relative(root, f)}` : `📄 ${f}`;
    }).join('\n');
  },
};

export const fsGetStructureTool: ToolDefinition = {
  name: 'fs_get_structure',
  description: 'Get folder tree of an allowed directory',
  parameters: StructureParam,
  async execute(args) {
    const { path, depth } = StructureParam.parse(args);
    const safe = assertAllowed(path);
    if (!existsSync(safe)) return `ERROR: Path not found: ${path}`;
    const lines = await walkDir(safe, depth ?? 3);
    return lines.join('\n') || '(empty)';
  },
};

export const vaultListTool: ToolDefinition = {
  name: 'vault_list',
  description: 'List all files in Obsidian vault',
  parameters: EmptyParam,
  async execute() {
    const vault = getVaultPath();
    if (!vault) return 'ERROR: VAULT_PATH not configured in .env';
    const lines = await walkDir(resolve(vault), 3);
    return lines.join('\n') || 'Vault is empty.';
  },
};

export const vaultReadTool: ToolDefinition = {
  name: 'vault_read',
  description: 'Read a specific vault note by name',
  parameters: VaultFileParam,
  async execute(args) {
    const { filename } = VaultFileParam.parse(args);
    const vault = getVaultPath();
    if (!vault) return 'ERROR: VAULT_PATH not configured in .env';
    const name = filename.endsWith('.md') ? filename : `${filename}.md`;
    const exact = join(resolve(vault), name);
    if (existsSync(exact)) {
      const content = await readFile(exact, 'utf-8');
      return content.slice(0, MAX_READ_BYTES);
    }
    const files = await walkMdFiles(resolve(vault));
    const match = files.find((f) => basename(f).toLowerCase() === name.toLowerCase());
    if (!match) return `Note "${filename}" not found in vault.`;
    const content = await readFile(match, 'utf-8');
    return content.slice(0, MAX_READ_BYTES);
  },
};

export const vaultSearchTool: ToolDefinition = {
  name: 'vault_search',
  description: 'Full-text search across vault .md files',
  parameters: VaultQueryParam,
  async execute(args) {
    const { query } = VaultQueryParam.parse(args);
    const vault = getVaultPath();
    if (!vault) return 'ERROR: VAULT_PATH not configured in .env';
    const files = await walkMdFiles(resolve(vault));
    const q = query.toLowerCase();
    const matches: string[] = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      if (content.toLowerCase().includes(q)) {
        const rel = relative(resolve(vault), file);
        const line = content.split('\n').find((l) => l.toLowerCase().includes(q));
        matches.push(`📄 ${rel}\n   ${line?.trim().slice(0, 100) ?? ''}`);
      }
      if (matches.length >= 15) break;
    }
    return matches.length ? matches.join('\n\n') : `No vault notes matching "${query}".`;
  },
};
