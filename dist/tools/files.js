import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { z } from 'zod';
const ReadFileParams = z.object({
    path: z.string().describe('Absolute or relative file path to read'),
});
const WriteFileParams = z.object({
    path: z.string().describe('File path to write'),
    content: z.string().describe('Content to write to the file'),
});
const ListDirParams = z.object({
    path: z.string().describe('Directory path to list'),
});
export const readFileTool = {
    name: 'read_file',
    description: 'Read the content of a file',
    parameters: ReadFileParams,
    async execute(args) {
        const { path } = ReadFileParams.parse(args);
        try {
            if (!existsSync(path))
                return `ERROR: File not found: ${path}`;
            const content = readFileSync(path, 'utf-8');
            // Truncate large files
            if (content.length > 8000) {
                return content.slice(0, 8000) + '\n...(truncated)';
            }
            return content;
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
export const writeFileTool = {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    parameters: WriteFileParams,
    async execute(args) {
        const { path, content } = WriteFileParams.parse(args);
        try {
            writeFileSync(path, content, 'utf-8');
            return `File written: ${path}`;
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
export const listDirTool = {
    name: 'list_dir',
    description: 'List files and directories at a given path',
    parameters: ListDirParams,
    async execute(args) {
        const { path } = ListDirParams.parse(args);
        try {
            if (!existsSync(path))
                return `ERROR: Path not found: ${path}`;
            const entries = readdirSync(path, { withFileTypes: true });
            const lines = entries.map((e) => e.isDirectory() ? `[DIR]  ${e.name}` : `[FILE] ${e.name}`);
            return lines.join('\n') || '(empty directory)';
        }
        catch (err) {
            return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
//# sourceMappingURL=files.js.map