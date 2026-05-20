import { z } from 'zod';
declare const ConvMessageSchema: z.ZodObject<{
    role: z.ZodEnum<["user", "assistant"]>;
    content: z.ZodString;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}, {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
}>;
export declare const MemoryEntrySchema: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    source: z.ZodEnum<["cli", "telegram"]>;
    type: z.ZodEnum<["conversation", "task", "reminder", "note", "fact"]>;
    title: z.ZodString;
    summary: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant"]>;
        content: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "assistant";
        content: string;
        timestamp: string;
    }, {
        role: "user" | "assistant";
        content: string;
        timestamp: string;
    }>, "many">;
    linkedIds: z.ZodArray<z.ZodString, "many">;
    dueDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "note" | "task" | "fact" | "conversation" | "reminder";
    id: string;
    tags: string[];
    source: "cli" | "telegram";
    timestamp: string;
    title: string;
    summary: string;
    messages: {
        role: "user" | "assistant";
        content: string;
        timestamp: string;
    }[];
    linkedIds: string[];
    dueDate?: string | undefined;
}, {
    type: "note" | "task" | "fact" | "conversation" | "reminder";
    id: string;
    tags: string[];
    source: "cli" | "telegram";
    timestamp: string;
    title: string;
    summary: string;
    messages: {
        role: "user" | "assistant";
        content: string;
        timestamp: string;
    }[];
    linkedIds: string[];
    dueDate?: string | undefined;
}>;
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export type ConvMessage = z.infer<typeof ConvMessageSchema>;
export declare function saveMemory(entry: Omit<MemoryEntry, 'id' | 'title' | 'summary' | 'tags' | 'linkedIds'>): Promise<MemoryEntry>;
export declare function searchMemories(query: string, limit?: number): Promise<MemoryEntry[]>;
export declare function getRecentMemories(limit?: number): MemoryEntry[];
export declare function getMemoryById(id: string): MemoryEntry | null;
export declare function getAllMemories(): MemoryEntry[];
/**
 * Returns all tasks (type === 'task') whose dueDate matches the given ISO date
 * string (YYYY-MM-DD). Falls back to searching all task entries if dueDate is
 * not stored in the index (legacy entries).
 */
export declare function getTasksByDate(isoDate: string): MemoryEntry[];
/** Returns all tasks regardless of due date. */
export declare function getAllTasks(): MemoryEntry[];
export {};
//# sourceMappingURL=memory-store.d.ts.map