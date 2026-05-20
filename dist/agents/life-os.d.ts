import { z } from 'zod';
import type { Agent } from './base.js';
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    project: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodString>;
    done: z.ZodBoolean;
    createdAt: z.ZodString;
    source: z.ZodEnum<["cli", "telegram"]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    source: "cli" | "telegram";
    createdAt: string;
    title: string;
    done: boolean;
    project?: string | undefined;
    dueDate?: string | undefined;
}, {
    id: string;
    source: "cli" | "telegram";
    createdAt: string;
    title: string;
    done: boolean;
    project?: string | undefined;
    dueDate?: string | undefined;
}>;
export declare const HabitSchema: z.ZodObject<{
    id: z.ZodString;
    goal: z.ZodString;
    frequency: z.ZodString;
    lastMentioned: z.ZodString;
    nudgeSentAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    goal: string;
    frequency: string;
    lastMentioned: string;
    nudgeSentAt: string | null;
}, {
    id: string;
    goal: string;
    frequency: string;
    lastMentioned: string;
    nudgeSentAt: string | null;
}>;
export declare const ReminderSchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    triggerAt: z.ZodString;
    sent: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    content: string;
    createdAt: string;
    triggerAt: string;
    sent: boolean;
}, {
    id: string;
    content: string;
    createdAt: string;
    triggerAt: string;
    sent: boolean;
}>;
export type Task = z.infer<typeof TaskSchema>;
export type Habit = z.infer<typeof HabitSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
export declare function loadTasks(): Task[];
export declare function saveTasks(t: Task[]): void;
export declare function loadHabits(): Habit[];
export declare function saveHabits(h: Habit[]): void;
export declare function loadReminders(): Reminder[];
export declare function saveReminders(r: Reminder[]): void;
export declare class LifeOSAgent implements Agent {
    name: string;
    description: string;
    private morningJob;
    private nightJob;
    private habitJob;
    private reminderInterval;
    init(): Promise<void>;
    stop(): Promise<void>;
    intercept(message: string): Promise<{
        handled: boolean;
        response?: string;
    }>;
    private morningBrief;
    private habitNudge;
    private nightRecap;
    private checkReminders;
}
//# sourceMappingURL=life-os.d.ts.map