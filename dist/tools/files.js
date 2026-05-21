import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { z } from 'zod';
import { assertAllowed, isBinary, MAX_FILE_READ_BYTES } from './filesystem.js';
// These tools share the same allow-list as fs_read_file / fs_list_dir.
// Without containment they would let the LLM (via Telegram, MCP, or the
// Python bridge) read or clobber arbitrary paths like ~/.ssh/authorized_keys.
const ReadFileParams = z.object({
    path: z.string().describe('Absolute or relative file path to read (must be inside an allowed root)'),
});
const WriteFileParams = z.object({
    path: z.string().describe('File path to write (must be inside an allowed root)'),
    content: z.string().describe('Content to write to the file'),
});
const ListDirParams = z.object({
    path: z.string().describe('Directory path to list (must be inside an allowed root)'),
});
const MAX_WRITE_BYTES = 256 * 1024; // 256KB
export const readFileTool = {
    name: 'read_file',
    description: 'Read the content of a file inside an allowed root (vault/notes/desktop/downloads).',
    parameters: ReadFileParams,
    async execute(args) {
        const { path } = ReadFileParams.parse(args);
        try {
            const safe = assertAllowed(path);
            if (!existsSync(safe))
                return `ERROR: File not found: ${path}`;
            if (isBinary(safe))
                return `ERROR: Cannot read binary file: ${path}`;
            const s = statSync(safe);
            if (s.size > MAX_FILE_READ_BYTES) {
                return `ERROR: File too large (${Math.round(s.size / 1024)}KB > 50KB limit)`;
            }
            const content = readFileSync(safe, 'utf-8');
            if (content.length > 8000)
                return content.slice(0, 8000) + '\n...(truncated)';
            return content;
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
export const writeFileTool = {
    name: 'write_file',
    description: 'Write content to a file inside an allowed root (vault/notes/desktop/downloads). Creates parent directories. Refuses to overwrite binary files.',
    parameters: WriteFileParams,
    async execute(args) {
        const { path, content } = WriteFileParams.parse(args);
        try {
            const safe = assertAllowed(path);
            if (isBinary(safe))
                return `ERROR: Refusing to write binary file extension: ${path}`;
            if (Buffer.byteLength(content, 'utf-8') > MAX_WRITE_BYTES) {
                return `ERROR: Content too large (>${Math.round(MAX_WRITE_BYTES / 1024)}KB)`;
            }
            const parent = dirname(safe);
            if (!existsSync(parent))
                mkdirSync(parent, { recursive: true });
            writeFileSync(safe, content, 'utf-8');
            return `File written: ${path}`;
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
export const listDirTool = {
    name: 'list_dir',
    description: 'List files and directories at a path inside an allowed root.',
    parameters: ListDirParams,
    async execute(args) {
        const { path } = ListDirParams.parse(args);
        try {
            const safe = assertAllowed(path);
            if (!existsSync(safe))
                return `ERROR: Path not found: ${path}`;
            const entries = readdirSync(safe, { withFileTypes: true });
            const lines = entries.map((e) => e.isDirectory() ? `[DIR]  ${e.name}` : `[FILE] ${e.name}`);
            return lines.join('\n') || '(empty directory)';
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
//# sourceMappingURL=files.js.map