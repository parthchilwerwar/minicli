export declare class MessageQueue {
    private queue;
    private processing;
    enqueue(chatId: number, message: string, history?: Array<{
        role: string;
        content: string;
    }>): Promise<string>;
    private processNext;
    get length(): number;
    get isProcessing(): boolean;
}
export declare const messageQueue: MessageQueue;
//# sourceMappingURL=queue.d.ts.map