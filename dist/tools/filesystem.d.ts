import type { ToolDefinition } from './registry.js';
export declare function getAllowedRoots(): string[];
/**
 * Resolve targetPath and verify it sits inside one of the allowed roots.
 * Uses path.relative() so /vault-evil cannot pass for /vault — a prefix
 * comparison via startsWith() would let that through.
 */
export declare function assertAllowed(targetPath: string): string;
/** Same containment check as assertAllowed but for a single explicit root. */
export declare function assertWithin(root: string, targetPath: string): string;
export declare function isBinary(filePath: string): boolean;
export declare const MAX_FILE_READ_BYTES: number;
export declare const fsListDirTool: ToolDefinition;
export declare const fsReadFileTool: ToolDefinition;
export declare const fsFindTool: ToolDefinition;
export declare const fsGetStructureTool: ToolDefinition;
export declare const vaultListTool: ToolDefinition;
export declare const vaultReadTool: ToolDefinition;
export declare const vaultSearchTool: ToolDefinition;
//# sourceMappingURL=filesystem.d.ts.map