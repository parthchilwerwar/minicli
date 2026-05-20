import { LifeOSAgent } from './life-os.js';
import { DevBuilderAgent } from './dev-builder.js';
import { TradingResearchAgent } from './trading-research.js';
import { OpportunityContentAgent } from './opportunity-content.js';
import { ProactiveAgent } from './proactive.js';
import { MemoryReviewerAgent } from './memory-reviewer.js';
// ─── Singleton instances ──────────────────────────────────────────────────────
export const lifeOsAgent = new LifeOSAgent();
export const devBuilderAgent = new DevBuilderAgent();
export const tradingAgent = new TradingResearchAgent();
export const oppContentAgent = new OpportunityContentAgent();
export const proactiveAgent = new ProactiveAgent();
export const memoryReviewer = new MemoryReviewerAgent();
const agents = [
    lifeOsAgent,
    devBuilderAgent,
    tradingAgent,
    oppContentAgent,
    proactiveAgent,
    memoryReviewer,
];
// ─── Lifecycle ────────────────────────────────────────────────────────────────
export async function startAllAgents() {
    for (const agent of agents) {
        try {
            await agent.init();
            console.log(`  ✓ Agent [${agent.name}] started`);
        }
        catch (err) {
            console.error(`  ✗ Agent [${agent.name}] failed:`, err instanceof Error ? err.message : err);
        }
    }
}
export async function stopAllAgents() {
    for (const agent of agents) {
        try {
            await agent.stop();
        }
        catch { /* best-effort */ }
    }
}
export function getAgentStatus() {
    return agents.map((a) => ({ name: a.name, running: true }));
}
//# sourceMappingURL=registry.js.map