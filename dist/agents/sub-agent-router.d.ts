interface RouteResult {
    triggered: boolean;
    agent?: string;
    response?: string;
}
export declare function routeToSubAgent(message: string): Promise<RouteResult>;
export {};
//# sourceMappingURL=sub-agent-router.d.ts.map