import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
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
// ─── Knowledge Graph ─────────────────────────────────────────────────────────
export class KnowledgeGraph {
    graphPath = join(homedir(), '.minicli', 'graph.json');
    graph = { nodes: [], edges: [] };
    // Serialize concurrent writes so a save mid-search can't truncate the file.
    // Every save() chains off this promise.
    writeQueue = Promise.resolve();
    // search() bumps accessCount on every hit, which previously fsync'd the
    // entire graph on every call (with no synchronization). We now batch:
    // increment in memory, persist at most once per ACCESS_SAVE_INTERVAL_MS.
    lastAccessSaveAt = 0;
    static ACCESS_SAVE_INTERVAL_MS = 30_000;
    async load() {
        const dir = join(homedir(), '.minicli');
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        if (!existsSync(this.graphPath)) {
            this.graph = { nodes: [], edges: [] };
            return;
        }
        try {
            const raw = readFileSync(this.graphPath, 'utf-8');
            const parsed = GraphSchema.parse(JSON.parse(raw));
            this.graph = { nodes: parsed.nodes, edges: parsed.edges };
        }
        catch {
            this.graph = { nodes: [], edges: [] };
        }
    }
    /** Atomic, serialized save: write to tmp then rename. */
    async save() {
        const next = this.writeQueue.then(() => this.writeNow());
        // Swallow rejection so one failed write doesn't block the queue.
        this.writeQueue = next.catch(() => undefined);
        await next;
    }
    writeNow() {
        return new Promise((resolve) => {
            try {
                const dir = join(homedir(), '.minicli');
                if (!existsSync(dir))
                    mkdirSync(dir, { recursive: true });
                const data = {
                    nodes: this.graph.nodes,
                    edges: this.graph.edges,
                    lastUpdated: new Date().toISOString(),
                };
                const tmp = `${this.graphPath}.tmp.${process.pid}.${Date.now()}`;
                writeFileSync(tmp, JSON.stringify(data, null, 2));
                renameSync(tmp, this.graphPath);
            }
            catch {
                /* best-effort — next write will retry */
            }
            finally {
                resolve();
            }
        });
    }
    async addNode(node) {
        const now = new Date().toISOString();
        const newNode = {
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
            if (existing.id === newNode.id)
                continue;
            const tagOverlap = newNode.tags.filter((t) => existing.tags.includes(t));
            if (tagOverlap.length > 0) {
                const weight = Math.min(tagOverlap.length / Math.max(newNode.tags.length, 1), 1);
                await this.addEdge(newNode.id, existing.id, 'related_to', weight);
            }
        }
        await this.save();
        return newNode;
    }
    async addEdge(from, to, relation, weight = 0.5) {
        // Avoid duplicate edges
        const exists = this.graph.edges.some((e) => e.from === from && e.to === to && e.relation === relation);
        if (exists)
            return;
        this.graph.edges.push({
            id: randomUUID().slice(0, 12),
            from,
            to,
            relation,
            weight: Math.max(0, Math.min(1, weight)),
        });
    }
    async search(query, limit = 10) {
        const q = query.toLowerCase().trim();
        if (!q) {
            return [...this.graph.nodes]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, limit);
        }
        const terms = q.split(/\s+/).filter(Boolean);
        const scored = this.graph.nodes.map((node) => {
            let score = 0;
            const label = node.label.toLowerCase();
            const content = node.content.toLowerCase();
            for (const term of terms) {
                if (label.includes(term))
                    score += 3;
                if (node.tags.some((t) => t.toLowerCase().includes(term)))
                    score += 2;
                if (content.includes(term))
                    score += 1;
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
        // Update access stats in memory; persist only on a cadence so we don't
        // fsync the entire graph on every search hit.
        const now = new Date().toISOString();
        for (const node of results) {
            node.accessCount += 1;
            node.lastAccessed = now;
        }
        if (results.length > 0) {
            const ms = Date.now() - this.lastAccessSaveAt;
            if (ms > KnowledgeGraph.ACCESS_SAVE_INTERVAL_MS) {
                this.lastAccessSaveAt = Date.now();
                await this.save();
            }
        }
        return results;
    }
    async getRelated(nodeId, depth = 1) {
        const visited = new Set();
        const result = [];
        let currentIds = [nodeId];
        for (let d = 0; d < depth; d++) {
            const nextIds = [];
            for (const id of currentIds) {
                if (visited.has(id))
                    continue;
                visited.add(id);
                const connectedEdges = this.graph.edges.filter((e) => e.from === id || e.to === id);
                for (const edge of connectedEdges) {
                    const otherId = edge.from === id ? edge.to : edge.from;
                    if (!visited.has(otherId)) {
                        nextIds.push(otherId);
                        const node = this.graph.nodes.find((n) => n.id === otherId);
                        if (node)
                            result.push(node);
                    }
                }
            }
            currentIds = nextIds;
        }
        return result;
    }
    async getByType(type) {
        return this.graph.nodes.filter((n) => n.type === type);
    }
    async prune(olderThanDays, types) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);
        const cutoffStr = cutoff.toISOString();
        const before = this.graph.nodes.length;
        const toRemove = new Set();
        this.graph.nodes = this.graph.nodes.filter((n) => {
            if (types.includes(n.type) && n.updatedAt < cutoffStr) {
                toRemove.add(n.id);
                return false;
            }
            return true;
        });
        // Remove orphaned edges
        this.graph.edges = this.graph.edges.filter((e) => !toRemove.has(e.from) && !toRemove.has(e.to));
        const deleted = before - this.graph.nodes.length;
        if (deleted > 0)
            await this.save();
        return deleted;
    }
    async summarize() {
        const nodes = this.graph.nodes;
        const edges = this.graph.edges;
        const typeCounts = {};
        for (const n of nodes) {
            typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
        }
        const breakdown = Object.entries(typeCounts)
            .map(([t, c]) => `${c} ${t}s`)
            .join(', ');
        return `${nodes.length} nodes (${breakdown}) | ${edges.length} edges`;
    }
    getNodeCount() {
        return this.graph.nodes.length;
    }
    getAllNodes() {
        return this.graph.nodes;
    }
}
// ─── Singleton ───────────────────────────────────────────────────────────────
export const graph = new KnowledgeGraph();
//# sourceMappingURL=knowledge-graph.js.map