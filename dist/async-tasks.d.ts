interface BackgroundTask {
    id: string;
    description: string;
    startedAt: string;
    status: 'running' | 'done' | 'failed';
    result?: string;
}
export declare class AsyncTaskManager {
    private tasks;
    run(description: string, task: () => Promise<string>, _chatId: number): Promise<string>;
    getStatus(id: string): BackgroundTask | undefined;
    listActive(): BackgroundTask[];
    listAll(): BackgroundTask[];
    formatActive(): string;
}
export declare const asyncTasks: AsyncTaskManager;
export {};
//# sourceMappingURL=async-tasks.d.ts.map