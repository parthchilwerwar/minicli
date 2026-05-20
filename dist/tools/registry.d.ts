import { z } from 'zod';
import type { ToolSchema } from '../llm.js';
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: z.ZodObject<z.ZodRawShape>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}
export declare function toSchema(tool: ToolDefinition): ToolSchema;
export declare const ALL_TOOLS: ToolDefinition[];
//# sourceMappingURL=registry.d.ts.map