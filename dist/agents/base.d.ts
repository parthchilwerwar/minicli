import TelegramBot from 'node-telegram-bot-api';
export declare function setBotRef(bot: TelegramBot, userId: number): void;
export declare function getBotRef(): TelegramBot | null;
export interface Agent {
    name: string;
    description: string;
    init(): Promise<void>;
    stop(): Promise<void>;
}
export interface AgentSection {
    emoji: string;
    title: string;
    lines: string[];
    alert?: boolean;
}
export declare function formatTelegram(sections: AgentSection[]): string;
export declare function formatCLI(sections: AgentSection[]): string;
export declare function printToCLI(sections: AgentSection[]): void;
export declare function broadcast(sections: AgentSection[], source: 'scheduled' | 'manual'): Promise<void>;
export declare function sendToTelegram(message: string): Promise<void>;
export declare function formatMessage(sections: {
    emoji: string;
    title: string;
    content: string;
}[]): string;
//# sourceMappingURL=base.d.ts.map