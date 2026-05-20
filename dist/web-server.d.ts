export declare function getWebPort(): number;
export declare function getLanIp(): string;
export declare function startWebServer(): Promise<{
    localUrl: string;
    publicUrl: string;
}>;
export declare function closeTunnel(): Promise<void>;
export declare function stopWebServer(): void;
export declare function getWebUrl(): string;
export declare function getPublicUrl(): string;
//# sourceMappingURL=web-server.d.ts.map