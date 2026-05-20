import type { Agent } from './base.js';
export declare class StudyAgent implements Agent {
    name: string;
    description: string;
    private studyMemories;
    private interval;
    init(): Promise<void>;
    stop(): Promise<void>;
    detectAndSave(message: string, response: string): Promise<void>;
    handleQuizResponse(message: string): Promise<string | null>;
    private checkDueQuizzes;
    private sendQuiz;
}
//# sourceMappingURL=study.d.ts.map