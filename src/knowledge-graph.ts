import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'person', 'project', 'task', 'habit', 'preference',
    'fact', 'conversation', 'research', 'finding', 'goal',
  ]),
  label: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  accessCount: z.number(),
  lastAccessed: z.string(),
});

const EdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  relation: z.enum([
    'related_to', 'part_of', 'blocks', 'depends_on',
    'led_to', 'contradicts', 'updates', 'references',
  ]),
  weight: z.number(),
});

const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  lastUpdated: z.string(),
});

type Node = z.infer<typeof NodeSchema>;
type Edge = z.infer<typeof EdgeSchema>;

// ─── Knowledge Graph ─────────────────────────────────────────────────────────

export class KnowledgeGraph {
  private graphPath = join(homedir(), '.minicli', 'graph.json');
  private graph: { nodes: Node[]; edges: Edge[] } = { nodes: [], edges: [] };

  async load(): Promise<void> {
    const dir = join(homedir(), '.minicli');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (!existsSync(this.graphPath)) {
      this.graph = { nodes: [], edges: [] };
      return;
    }

    try {
      const raw = readFileSync(this.graphPath, 'utf-8');
      const parsed = GraphSchema.parse(JSON.parse(raw));
      this.graph = { nodes: parsed.nodes, edges: parsed.edges };
    } catch {
      this.graph = { nodes: [], edges: [] };
    }
  }

  async save(): Promise<void> {
    const dir = join(homedir(), '.minicli');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const data = {
      nodes: this.graph.nodes,
      edges: this.graph.edges,
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(this.graphPath, JSON.stringify(data, null, 2));
  }

  async addNode(
    node: Omit<Node, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessed'>
  ): Promise<Node> {
    const now = new Date().toISOString();
    const newNode: Node = {
      ...node,
      id: randomUUID().slice(0, 12),
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessed: now,
    };

    this.graph.nodes.push(newNode);

    // Auto-detect edges by tag overlap
    for (const existing of this.graph.nodes) {
      if (existing.id === newNode.id) continue;
      const tagOverlap = newNode.tags.filter((t) => existing.tags.includes(t));
      if (tagOverlap.length > 0) {
        const weight = Math.min(tagOverlap.length / Math.max(newNode.tags.length, 1), 1);
        await this.addEdge(newNode.id, existing.id, 'related_to', weight);
      }
    }

    await this.save();
    return newNode;
  }

  async addEdge(
    from: string,
    to: string,
    relation: Edge['relation'],
    weight = 0.5
  ): Promise<void> {
    // Avoid duplicate edges
    const exists = this.graph.edges.some(
      (e) => e.from === from && e.to === to && e.relation === relation
    );
    if (exists) return;

    this.graph.edges.push({
      id: randomUUID().slice(0, 12),
      from,
      to,
      relation,
      weight: Math.max(0, Math.min(1, weight)),
    });
  }

  async search(query: string, limit = 10): Promise<Node[]> {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);

    const scored = this.graph.nodes.map((node) => {
      let score = 0;
      const label = node.label.toLowerCase();
      const content = node.content.toLowerCase();

      for (const term of terms) {
        if (label.includes(term)) score += 3;
        if (node.tags.some((t) => t.toLowerCase().includes(term))) score += 2;
        if (content.includes(term)) score += 1;
      }

      // Boost by access frequency (logarithmic)
      score += Math.log2(node.accessCount + 1) * 0.5;

      return { node, score };
    });

    const results = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.node);

    // Update access stats
    const now = new Date().toISOString();
    for (const node of results) {
      node.accessCount += 1;
      node.lastAccessed = now;
    }
    if (results.length > 0) await this.save();

    return results;
  }

  async getRelated(nodeId: string, depth = 1): Promise<Node[]> {
    const visited = new Set<string>();
    const result: Node[] = [];
    let currentIds = [nodeId];

    for (let d = 0; d < depth; d++) {
      const nextIds: string[] = [];
      for (const id of currentIds) {
        if (visited.has(id)) continue;
        visited.add(id);

        const connectedEdges = this.graph.edges.filter(
          (e) => e.from === id || e.to === id
        );
        for (const edge of connectedEdges) {
          const otherId = edge.from === id ? edge.to : edge.from;
          if (!visited.has(otherId)) {
            nextIds.push(otherId);
            const node = this.graph.nodes.find((n) => n.id === otherId);
            if (node) result.push(node);
          }
        }
      }
      currentIds = nextIds;
    }

    return result;
  }

  async getByType(type: Node['type']): Promise<Node[]> {
    return this.graph.nodes.filter((n) => n.type === type);
  }

  async prune(olderThanDays: number, types: Node['type'][]): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffStr = cutoff.toISOString();

    const before = this.graph.nodes.length;
    const toRemove = new Set<string>();

    this.graph.nodes = this.graph.nodes.filter((n) => {
      if (types.includes(n.type) && n.updatedAt < cutoffStr) {
        toRemove.add(n.id);
        return false;
      }
      return true;
    });

    // Remove orphaned edges
    this.graph.edges = this.graph.edges.filter(
      (e) => !toRemove.has(e.from) && !toRemove.has(e.to)
    );

    const deleted = before - this.graph.nodes.length;
    if (deleted > 0) await this.save();
    return deleted;
  }

  async summarize(): Promise<string> {
    const nodes = this.graph.nodes;
    const edges = this.graph.edges;
    const typeCounts: Record<string, number> = {};
    for (const n of nodes) {
      typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
    }
    const breakdown = Object.entries(typeCounts)
      .map(([t, c]) => `${c} ${t}s`)
      .join(', ');
    return `${nodes.length} nodes (${breakdown}) | ${edges.length} edges`;
  }

  getNodeCount(): number {
    return this.graph.nodes.length;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const graph = new KnowledgeGraph();
