import { randomUUID } from 'crypto';
import { getBridgePort, getBridgeSecret } from './config.js';
// ─── Bridge call (same as telegram.ts) ───────────────────────────────────────
async function bridgeExecute(message, history) {
    const port = getBridgePort();
    const secret = getBridgeSecret();
    const url = `http://127.0.0.1:${port}/execute`;
    const headers = { 'Content-Type': 'application/json' };
    if (secret)
        headers['X-Bridge-Secret'] = secret;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, history }),
    });
    const data = (await res.json());
    if (!res.ok)
        return `❌ Error: ${String(data['error'] ?? 'unknown')}`;
    return String(data['result'] ?? JSON.stringify(data, null, 2));
}
// ─── Message Queue ───────────────────────────────────────────────────────────
export class MessageQueue {
    queue = [];
    processing = false;
    async enqueue(chatId, message, history = []) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                id: randomUUID(),
                chatId,
                message,
                history,
                timestamp: new Date(),
                resolve,
                reject,
            });
            void this.processNext();
        });
    }
    async processNext() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        const item = this.queue.shift();
        if (!item) {
            this.processing = false;
            return;
        }
        try {
            const response = await bridgeExecute(item.message, item.history);
            item.resolve(response);
        }
        catch (err) {
            item.reject(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            this.processing = false;
            void this.processNext();
        }
    }
    get length() {
        return this.queue.length;
    }
    get isProcessing() {
        return this.processing;
    }
}
// ─── Singleton ───────────────────────────────────────────────────────────────
export const messageQueue = new MessageQueue();
//# sourceMappingURL=queue.js.map