import type { Agent } from './base.js';
export declare class ProactiveAgent implements Agent {
    name: string;
    description: string;
    private cronTask;
    private warmupTimer;
    init(): Promise<void>;
    stop(): Promise<void>;
    check(): Promise<void>;
    suppressTopic(topic: string, days?: number): void;
}
export declare const proactiveAgent: ProactiveAgent;
//# sourceMappingURL=proactive.d.ts.map