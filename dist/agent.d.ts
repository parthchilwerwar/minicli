import type { Message } from './memory.js';
import type { ToolDefinition } from './tools/registry.js';
export declare function runAgent(userMessage: string, tools: ToolDefinition[], history: Message[], stream?: boolean): Promise<string>;
export declare function runSupervisedPlan(task: string, tools: ToolDefinition[]): Promise<void>;
//# sourceMappingURL=agent.d.ts.map