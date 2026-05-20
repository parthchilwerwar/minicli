import { LifeOSAgent } from './life-os.js';
import { DevBuilderAgent } from './dev-builder.js';
import { TradingResearchAgent } from './trading-research.js';
import { OpportunityContentAgent } from './opportunity-content.js';
import { ProactiveAgent } from './proactive.js';
import { MemoryReviewerAgent } from './memory-reviewer.js';
export declare const lifeOsAgent: LifeOSAgent;
export declare const devBuilderAgent: DevBuilderAgent;
export declare const tradingAgent: TradingResearchAgent;
export declare const oppContentAgent: OpportunityContentAgent;
export declare const proactiveAgent: ProactiveAgent;
export declare const memoryReviewer: MemoryReviewerAgent;
export declare function startAllAgents(): Promise<void>;
export declare function stopAllAgents(): Promise<void>;
export declare function getAgentStatus(): {
    name: string;
    running: boolean;
}[];
//# sourceMappingURL=registry.d.ts.map