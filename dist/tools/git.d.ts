import type { DefaultLogFields } from 'simple-git';
import type { ToolDefinition } from './registry.js';
export declare const gitStatusTool: ToolDefinition;
export declare const gitLogTool: ToolDefinition;
export declare const gitDiffTool: ToolDefinition;
export declare const gitStatsTool: ToolDefinition;
export declare function getRawGitStatus(): Promise<import("simple-git").StatusResult>;
export declare function getRawGitLog(n: number): Promise<import("simple-git").LogResult<DefaultLogFields>>;
export declare function getRawGitDiff(): Promise<string>;
//# sourceMappingURL=git.d.ts.map