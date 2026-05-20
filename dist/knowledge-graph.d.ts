import { z } from 'zod';
declare const NodeSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["person", "project", "task", "habit", "preference", "fact", "conversation", "research", "finding", "goal"]>;
    label: z.ZodString;
    content: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    accessCount: z.ZodNumber;
    lastAccessed: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "person" | "project" | "task" | "habit" | "preference" | "fact" | "conversation" | "research" | "finding" | "goal";
    id: string;
    tags: string[];
    updatedAt: string;
    content: string;
    label: string;
    createdAt: string;
    accessCount: number;
    lastAccessed: string;
}, {
    type: "person" | "project" | "task" | "habit" | "preference" | "fact" | "conversation" | "research" | "finding" | "goal";
    id: string;
    tags: string[];
    updatedAt: string;
    content: string;
    label: string;
    createdAt: string;
    accessCount: number;
    lastAccessed: string;
}>;
declare const EdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    relation: z.ZodEnum<["related_to", "part_of", "blocks", "depends_on", "led_to", "contradicts", "updates", "references"]>;
    weight: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    from: string;
    to: string;
    relation: "related_to" | "part_of" | "blocks" | "depends_on" | "led_to" | "contradicts" | "updates" | "references";
    weight: number;
}, {
    id: string;
    from: string;
    to: string;
    relation: "related_to" | "part_of" | "blocks" | "depends_on" | "led_to" | "contradicts" | "updates" | "references";
    weight: number;
}>;
type Node = z.infer<typeof NodeSchema>;
type Edge = z.infer<typeof EdgeSchema>;
export declare class KnowledgeGraph {
    private graphPath;
    private graph;
    load(): Promise<void>;
    save(): Promise<void>;
    addNode(node: Omit<Node, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessed'>): Promise<Node>;
    addEdge(from: string, to: string, relation: Edge['relation'], weight?: number): Promise<void>;
    search(query: string, limit?: number): Promise<Node[]>;
    getRelated(nodeId: string, depth?: number): Promise<Node[]>;
    getByType(type: Node['type']): Promise<Node[]>;
    prune(olderThanDays: number, types: Node['type'][]): Promise<number>;
    summarize(): Promise<string>;
    getNodeCount(): number;
    getAllNodes(): Node[];
}
export declare const graph: KnowledgeGraph;
export {};
//# sourceMappingURL=knowledge-graph.d.ts.map