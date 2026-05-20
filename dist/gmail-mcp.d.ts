import type { ToolDefinition } from './tools/registry.js';
export declare function startGmailMCP(): Promise<string>;
export declare function stopGmailMCP(): Promise<void>;
export declare function isGmailConnected(): boolean;
export declare const gmailListTool: ToolDefinition;
export declare const gmailReadTool: ToolDefinition;
export declare const gmailSendTool: ToolDefinition;
export declare const gmailSearchTool: ToolDefinition;
export declare const gmailUnreadCountTool: ToolDefinition;
export declare const gmailMCPConfig: {
    name: string;
    command: string;
    args: string[];
    env: {
        GOOGLE_CLIENT_ID: string;
        GOOGLE_CLIENT_SECRET: string;
        GOOGLE_REFRESH_TOKEN: string;
    };
};
//# sourceMappingURL=gmail-mcp.d.ts.map