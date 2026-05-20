declare const CONFIG_DIR: string;
export declare function getApiKey(): string;
export declare const PRIMARY_MODEL = "google/gemma-4-31b-it:free";
export declare const FALLBACK_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";
export declare function getModel(override?: string): string;
export declare function getMcpPort(): number;
export declare function getBridgePort(): number;
export declare function getBridgeSecret(): string;
export declare function getVaultPath(): string;
export declare function getDesktopPath(): string;
export declare function getDownloadsPath(): string;
export declare function getNotesPath(): string;
export { CONFIG_DIR };
//# sourceMappingURL=config.d.ts.map