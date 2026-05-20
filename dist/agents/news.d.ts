export interface Agent {
    name: string;
    handle(query: string): Promise<string>;
}
export declare class NewsAgent implements Agent {
    name: string;
    handle(query: string): Promise<string>;
}
export declare const newsAgent: NewsAgent;
//# sourceMappingURL=news.d.ts.map