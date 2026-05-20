import type { Agent } from './base.js';

// Python LangGraph agents handle everything now.
// This file is kept for interface compatibility with daemon.ts.

const agents: Agent[] = [];

export async function startAllAgents(): Promise<void> {
  // Agents are now managed by Python LangGraph server on :6280
  console.log('  ℹ Agents managed by Python LangGraph server');
}

export async function stopAllAgents(): Promise<void> {
  // No-op: Python server handles agent lifecycle
}

export function getAgentStatus(): { name: string; running: boolean }[] {
  return [
    { name: 'supervisor', running: true },
    { name: 'life-os', running: true },
    { name: 'dev-builder', running: true },
    { name: 'research', running: true },
    { name: 'content', running: true },
    { name: 'proactive', running: true },
  ];
}
