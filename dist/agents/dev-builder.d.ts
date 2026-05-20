import { z } from 'zod';
import type { Agent } from './base.js';
export declare const BugFindingSchema: z.ZodObject<{
    id: z.ZodString;
    target: z.ZodString;
    type: z.ZodString;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    description: z.ZodString;
    status: z.ZodEnum<["found", "reported", "accepted", "rejected"]>;
    foundAt: z.ZodString;
    reward: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: string;
    status: "found" | "reported" | "accepted" | "rejected";
    id: string;
    description: string;
    target: string;
    severity: "low" | "medium" | "high" | "critical";
    foundAt: string;
    reward?: number | undefined;
}, {
    type: string;
    status: "found" | "reported" | "accepted" | "rejected";
    id: string;
    description: string;
    target: string;
    severity: "low" | "medium" | "high" | "critical";
    foundAt: string;
    reward?: number | undefined;
}>;
export type BugFinding = z.infer<typeof BugFindingSchema>;
export declare function loadBounties(): BugFinding[];
export declare function saveBounties(b: BugFinding[]): void;
export declare class DevBuilderAgent implements Agent {
    name: string;
    description: string;
    private dailyJob;
    private passiveJob;
    private lastNudge;
    init(): Promise<void>;
    stop(): Promise<void>;
    dailyCheck(): Promise<void>;
    rewriteCommit(repo: string): Promise<string>;
    private passiveCheck;
}
//# sourceMappingURL=dev-builder.d.ts.map