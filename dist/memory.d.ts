import { z } from 'zod';
declare const NoteSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    ts: z.ZodNumber;
    kind: z.ZodLiteral<"note">;
}, "strip", z.ZodTypeAny, {
    id: string;
    text: string;
    tags: string[];
    ts: number;
    kind: "note";
}, {
    id: string;
    text: string;
    tags: string[];
    ts: number;
    kind: "note";
}>;
declare const RoutineSchema: z.ZodObject<{
    id: z.ZodString;
    desc: z.ZodString;
    cronExpr: z.ZodOptional<z.ZodString>;
    once: z.ZodOptional<z.ZodBoolean>;
    lastRun: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    desc: string;
    cronExpr?: string | undefined;
    once?: boolean | undefined;
    lastRun?: number | undefined;
}, {
    id: string;
    desc: string;
    cronExpr?: string | undefined;
    once?: boolean | undefined;
    lastRun?: number | undefined;
}>;
declare const ContextSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    goals: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    habits: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    preferences: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodRecord<z.ZodString, z.ZodString>]>>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    bio?: string | undefined;
    goals?: string | string[] | undefined;
    habits?: string | string[] | undefined;
    preferences?: string | Record<string, string> | undefined;
    updatedAt?: string | undefined;
}, {
    name?: string | undefined;
    bio?: string | undefined;
    goals?: string | string[] | undefined;
    habits?: string | string[] | undefined;
    preferences?: string | Record<string, string> | undefined;
    updatedAt?: string | undefined;
}>;
declare const ToolCallSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"function">;
    function: z.ZodObject<{
        name: z.ZodString;
        arguments: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        arguments: string;
    }, {
        name: string;
        arguments: string;
    }>;
}, "strip", z.ZodTypeAny, {
    function: {
        name: string;
        arguments: string;
    };
    type: "function";
    id: string;
}, {
    function: {
        name: string;
        arguments: string;
    };
    type: "function";
    id: string;
}>;
declare const MessageSchema: z.ZodObject<{
    role: z.ZodEnum<["user", "assistant", "system", "tool"]>;
    content: z.ZodOptional<z.ZodString>;
    tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"function">;
        function: z.ZodObject<{
            name: z.ZodString;
            arguments: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            arguments: string;
        }, {
            name: string;
            arguments: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }, {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }>, "many">>;
    tool_call_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "assistant" | "system" | "tool";
    content?: string | undefined;
    tool_calls?: {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }[] | undefined;
    tool_call_id?: string | undefined;
}, {
    role: "user" | "assistant" | "system" | "tool";
    content?: string | undefined;
    tool_calls?: {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }[] | undefined;
    tool_call_id?: string | undefined;
}>;
export type Note = z.infer<typeof NoteSchema>;
export type Routine = z.infer<typeof RoutineSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type Message = z.infer<typeof MessageSchema>;
export declare function loadNotes(): Note[];
export declare function saveNote(text: string, tags: string[]): Note;
export declare function deleteNote(id: string): boolean;
export declare function searchNotes(query: string): Note[];
export declare function filterByTag(tag: string): Note[];
export declare function loadHistory(): Message[];
export declare function saveHistory(messages: Message[]): void;
export declare function clearHistory(): void;
export declare function appendHistory(message: Message): void;
export declare function loadRoutines(): Routine[];
export declare function saveRoutine(desc: string, cronExpr?: string, once?: boolean): Routine;
export declare function updateRoutine(routine: Routine): void;
export declare function deleteRoutine(id: string): boolean;
export declare function loadContext(): Context;
export declare function saveContext(data: unknown): void;
export declare function clearContext(): void;
export {};
//# sourceMappingURL=memory.d.ts.map