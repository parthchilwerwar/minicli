import type { Agent } from './base.js';
export declare class MemoryReviewerAgent implements Agent {
    name: string;
    description: string;
    private cronTask;
    init(): Promise<void>;
    stop(): Promise<void>;
    review(): Promise<void>;
}
export declare const memoryReviewerAgent: MemoryReviewerAgent;
//# sourceMappingURL=memory-reviewer.d.ts.map