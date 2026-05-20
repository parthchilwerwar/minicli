import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';
// Always load .env from the project root (dist/../.env) regardless of CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });
const CONFIG_DIR = join(homedir(), '.minicli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ConfigSchema = z.object({
    model: z.string().optional(),
    mcpPort: z.number().int().min(1024).max(65535).optional(),
});
function loadConfigFile() {
    if (!existsSync(CONFIG_FILE))
        return {};
    try {
        const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        return ConfigSchema.parse(raw);
    }
    catch {
        return {};
    }
}
const fileConfig = loadConfigFile();
export function getApiKey() {
    const key = process.env['OPENROUTER_API_KEY'] ?? '';
    if (!key)
        throw new Error('OPENROUTER_API_KEY not set. Add it to .env in the minicli project folder.');
    return key;
}
export const PRIMARY_MODEL = 'google/gemma-4-31b-it:free';
export const FALLBACK_MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';
export function getModel(override) {
    return override
        ?? process.env['OPENROUTER_MODEL']
        ?? fileConfig.model
        ?? PRIMARY_MODEL;
}
export function getMcpPort() {
    return fileConfig.mcpPort ?? 6274;
}
export function getBridgePort() {
    const p = process.env['BRIDGE_PORT'];
    return p ? parseInt(p, 10) : 6275;
}
export function getBridgeSecret() {
    return process.env['BRIDGE_SECRET'] ?? '';
}
export function getVaultPath() {
    return process.env['VAULT_PATH'] ?? process.env['OBSIDIAN_VAULT_PATH'] ?? '';
}
export function getDesktopPath() {
    return process.env['DESKTOP_PATH'] ?? '';
}
export function getDownloadsPath() {
    return process.env['DOWNLOADS_PATH'] ?? '';
}
export function getNotesPath() {
    return process.env['NOTES_FOLDER_PATH'] ?? '';
}
export { CONFIG_DIR };
//# sourceMappingURL=config.js.map