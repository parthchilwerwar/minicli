import type { Agent } from './base.js';
export declare class MorningBriefAgent implements Agent {
    name: string;
    description: string;
    private task;
    init(): Promise<void>;
    stop(): Promise<void>;
    private generateAndSend;
}
//# sourceMappingURL=morning-brief.d.ts.map