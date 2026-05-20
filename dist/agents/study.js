import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { callLLM } from '../llm.js';
import { sendToTelegram } from './base.js';
// ─── Schema ───────────────────────────────────────────────────────────────────
const StudyMemorySchema = z.object({
    id: z.string(),
    topic: z.string(),
    subject: z.string(),
    studiedAt: z.string(),
    quizScheduled: z.string(),
    quizSent: z.boolean(),
});
const STUDY_FILE = path.join(homedir(), '.minicli', 'study-memories.json');
// ─── Persistence ──────────────────────────────────────────────────────────────
function loadStudyMemories() {
    if (!fs.existsSync(STUDY_FILE))
        return [];
    try {
        return z.array(StudyMemorySchema).parse(JSON.parse(fs.readFileSync(STUDY_FILE, 'utf-8')));
    }
    catch {
        return [];
    }
}
function saveStudyMemories(memories) {
    fs.mkdirSync(path.dirname(STUDY_FILE), { recursive: true });
    fs.writeFileSync(STUDY_FILE, JSON.stringify(memories, null, 2));
}
// ─── Agent ────────────────────────────────────────────────────────────────────
export class StudyAgent {
    name = 'study';
    description = 'Tracks study sessions and sends follow-up quizzes 3 days later';
    studyMemories = [];
    interval = null;
    async init() {
        this.studyMemories = loadStudyMemories();
        // Check every hour for due quizzes
        this.interval = setInterval(() => { void this.checkDueQuizzes(); }, 60 * 60 * 1000);
        void this.checkDueQuizzes();
    }
    async stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    async detectAndSave(message, response) {
        try {
            const prompt = `Is this a study/learning interaction? Output JSON only:\n{ "isStudy": boolean, "topic": "topic name if study", "subject": "e.g. Deep Learning, DSA, NLP" }\n\nUser: ${message}\nAssistant: ${response.slice(0, 500)}`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({ isStudy: z.boolean(), topic: z.string().optional(), subject: z.string().optional() })
                .parse(JSON.parse(raw));
            if (!data.isStudy || !data.topic)
                return;
            const now = new Date();
            const quizDate = new Date(now);
            quizDate.setDate(quizDate.getDate() + 3);
            const mem = {
                id: nanoid(8),
                topic: data.topic,
                subject: data.subject ?? 'General',
                studiedAt: now.toISOString(),
                quizScheduled: quizDate.toISOString(),
                quizSent: false,
            };
            this.studyMemories.push(mem);
            saveStudyMemories(this.studyMemories);
        }
        catch { /* best-effort */ }
    }
    async handleQuizResponse(message) {
        const recentUnsent = this.studyMemories.filter((m) => m.quizSent);
        if (!recentUnsent.length)
            return null;
        try {
            const prompt = `Is this a quiz answer response? If yes, give helpful feedback.\nTopics studied: ${recentUnsent.map((m) => m.topic).join(', ')}\nUser message: "${message}"\nOutput JSON only:\n{ "isQuizResponse": boolean, "feedback": "feedback string if quiz response" }`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({ isQuizResponse: z.boolean(), feedback: z.string().optional() })
                .parse(JSON.parse(raw));
            if (!data.isQuizResponse || !data.feedback)
                return null;
            return `🧠 *Feedback*\n\n${data.feedback}`;
        }
        catch {
            return null;
        }
    }
    async checkDueQuizzes() {
        const now = new Date();
        let changed = false;
        for (const mem of this.studyMemories) {
            if (mem.quizSent)
                continue;
            if (new Date(mem.quizScheduled) > now)
                continue;
            await this.sendQuiz(mem);
            mem.quizSent = true;
            changed = true;
        }
        if (changed)
            saveStudyMemories(this.studyMemories);
    }
    async sendQuiz(mem) {
        try {
            const prompt = `Generate 3 concise quiz questions for the topic "${mem.topic}" (subject: ${mem.subject}). Output JSON only:\n{ "questions": ["q1", "q2", "q3"] }`;
            const res = await callLLM([{ role: 'user', content: prompt }]);
            const raw = res.content.trim().replace(/```json|```/g, '').trim();
            const data = z.object({ questions: z.array(z.string()).length(3) }).parse(JSON.parse(raw));
            const daysAgo = Math.round((Date.now() - new Date(mem.studiedAt).getTime()) / (1000 * 60 * 60 * 24));
            const msg = `🧠 *Study check-in*\n\nYou studied *${mem.topic}* ${daysAgo} days ago.\n\nQuick quiz — answer in your own words:\n` +
                data.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
                '\n\nReply when you\'re ready and I\'ll give you feedback.';
            await sendToTelegram(msg);
        }
        catch { /* best-effort */ }
    }
}
//# sourceMappingURL=study.js.map