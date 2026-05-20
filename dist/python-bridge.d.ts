export declare function startPythonServer(): Promise<void>;
export declare function stopPythonServer(): void;
export declare function callPythonAgent(message: string, chatId: string, history?: {
    role: string;
    content: string;
}[]): Promise<string>;
//# sourceMappingURL=python-bridge.d.ts.map