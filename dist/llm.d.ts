import type { Message, ToolCall } from './memory.js';
export declare function refreshPersonaCache(): void;
export interface LLMResponse {
    content: string;
    tool_calls?: ToolCall[];
}
export interface ToolSchema {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export declare function callLLM(messages: Message[], tools?: ToolSchema[], modelOverride?: string, stream?: boolean): Promise<LLMResponse>;
export declare function quickLLM(prompt: string, modelOverride?: string): Promise<string>;
//# sourceMappingURL=llm.d.ts.map