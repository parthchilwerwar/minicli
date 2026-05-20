import type { Agent } from './base.js';
export declare class CaptureAgent implements Agent {
    name: string;
    description: string;
    private cronJobs;
    init(): Promise<void>;
    stop(): Promise<void>;
    intercept(message: string): Promise<{
        handled: boolean;
        response?: string;
    }>;
    private scheduleReminder;
    private scheduleReminderCron;
}
//# sourceMappingURL=capture.d.ts.map