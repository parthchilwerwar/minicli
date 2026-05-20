import { z } from 'zod';
import type { Agent } from './base.js';
export declare const OpportunitySchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["hackathon", "internship", "bounty", "tool"]>;
    title: z.ZodString;
    description: z.ZodString;
    deadline: z.ZodNullable<z.ZodString>;
    url: z.ZodString;
    relevanceScore: z.ZodNumber;
    seen: z.ZodBoolean;
    savedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "tool" | "hackathon" | "internship" | "bounty";
    id: string;
    title: string;
    description: string;
    url: string;
    deadline: string | null;
    relevanceScore: number;
    seen: boolean;
    savedAt: string;
}, {
    type: "tool" | "hackathon" | "internship" | "bounty";
    id: string;
    title: string;
    description: string;
    url: string;
    deadline: string | null;
    relevanceScore: number;
    seen: boolean;
    savedAt: string;
}>;
export declare const ContentLogSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["tweet", "linkedin", "readme", "announcement"]>;
    topic: z.ZodString;
    generatedAt: z.ZodString;
    posted: z.ZodBoolean;
    postedAt: z.ZodNullable<z.ZodString>;
    platform: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "tweet" | "linkedin" | "readme" | "announcement";
    id: string;
    topic: string;
    generatedAt: string;
    posted: boolean;
    postedAt: string | null;
    platform: string | null;
}, {
    type: "tweet" | "linkedin" | "readme" | "announcement";
    id: string;
    topic: string;
    generatedAt: string;
    posted: boolean;
    postedAt: string | null;
    platform: string | null;
}>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type ContentLog = z.infer<typeof ContentLogSchema>;
export declare function loadOpportunities(): Opportunity[];
export declare function saveOpportunities(o: Opportunity[]): void;
export declare function loadContentLog(): ContentLog[];
export declare function saveContentLog(c: ContentLog[]): void;
export declare class OpportunityContentAgent implements Agent {
    name: string;
    description: string;
    private digestJob;
    private contentJob;
    init(): Promise<void>;
    stop(): Promise<void>;
    weeklyDigest(): Promise<void>;
    generateContent(type: 'tweet' | 'linkedin' | 'readme' | 'announcement', topic: string): Promise<string>;
    private contentReminder;
}
//# sourceMappingURL=opportunity-content.d.ts.map