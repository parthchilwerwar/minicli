import { z } from 'zod';
import type { Agent } from './base.js';
export declare const WatchlistSchema: z.ZodObject<{
    id: z.ZodString;
    asset: z.ZodString;
    type: z.ZodEnum<["crypto", "stock"]>;
    alertThreshold: z.ZodNumber;
    addedAt: z.ZodString;
    lastAlertAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "crypto" | "stock";
    id: string;
    asset: string;
    alertThreshold: number;
    addedAt: string;
    lastAlertAt: string | null;
}, {
    type: "crypto" | "stock";
    id: string;
    asset: string;
    alertThreshold: number;
    addedAt: string;
    lastAlertAt: string | null;
}>;
export declare const ResearchSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    keyPoints: z.ZodArray<z.ZodString, "many">;
    tags: z.ZodArray<z.ZodString, "many">;
    savedAt: z.ZodString;
    linkedProjects: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    tags: string[];
    title: string;
    summary: string;
    url: string;
    savedAt: string;
    keyPoints: string[];
    linkedProjects: string[];
}, {
    id: string;
    tags: string[];
    title: string;
    summary: string;
    url: string;
    savedAt: string;
    keyPoints: string[];
    linkedProjects: string[];
}>;
export type WatchlistItem = z.infer<typeof WatchlistSchema>;
export type ResearchItem = z.infer<typeof ResearchSchema>;
export declare function loadWatchlist(): WatchlistItem[];
export declare function saveWatchlist(w: WatchlistItem[]): void;
export declare function loadResearch(): ResearchItem[];
export declare function saveResearch(r: ResearchItem[]): void;
export declare class TradingResearchAgent implements Agent {
    name: string;
    description: string;
    private marketJob;
    private alertJob;
    init(): Promise<void>;
    stop(): Promise<void>;
    marketBrief(): Promise<void>;
    interceptUrl(url: string): Promise<string | null>;
    private checkAlerts;
}
//# sourceMappingURL=trading-research.d.ts.map