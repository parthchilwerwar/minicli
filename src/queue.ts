import { randomUUID } from 'crypto';
import { getBridgePort, getBridgeSecret } from './config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueuedMessage {
  id: string;
  chatId: number;
  message: string;
  history: Array<{ role: string; content: string }>;
  timestamp: Date;
  resolve: (response: string) => void;
  reject: (err: Error) => void;
}

// ─── Bridge call (same as telegram.ts) ───────────────────────────────────────

async function bridgeExecute(
  message: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const port = getBridgePort();
  const secret = getBridgeSecret();
  const url = `http://127.0.0.1:${port}/execute`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Bridge-Secret'] = secret;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, history }),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return `❌ Error: ${String(data['error'] ?? 'unknown')}`;
  return String(data['result'] ?? JSON.stringify(data, null, 2));
}

// ─── Message Queue ───────────────────────────────────────────────────────────

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing = false;

  async enqueue(
    chatId: number,
    message: string,
    history: Array<{ role: string; content: string }> = []
  ): Promise<string> {
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

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift();
    if (!item) {
      this.processing = false;
      return;
    }

    try {
      const response = await bridgeExecute(item.message, item.history);
      item.resolve(response);
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.processing = false;
      void this.processNext();
    }
  }

  get length(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const messageQueue = new MessageQueue();
