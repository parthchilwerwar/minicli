import type { Agent } from './base.js';
export declare class DevAssistantAgent implements Agent {
    name: string;
    description: string;
    private dailyTask;
    private passiveTask;
    private lastNudgeAt;
    init(): Promise<void>;
    stop(): Promise<void>;
    private dailyCheck;
    private passiveCheck;
    rewriteCommitMessage(diff: string): Promise<string>;
}
//# sourceMappingURL=dev-assistant.d.ts.map