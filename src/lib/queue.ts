import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class MessageQueue {
  private queueFile: string;
  private lockFile: string;

  constructor() {
    const sidecarDir = path.join(os.homedir(), ".claude-sidecar");
    if (!fs.existsSync(sidecarDir)) {
      fs.mkdirSync(sidecarDir, { recursive: true });
    }
    this.queueFile = path.join(sidecarDir, "queue.json");
    this.lockFile = path.join(sidecarDir, "queue.lock");
  }

  private async acquireLock(maxRetries = 10): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        fs.writeFileSync(this.lockFile, process.pid.toString(), { flag: "wx" });
        return true;
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    return false;
  }

  private releaseLock(): void {
    try {
      fs.unlinkSync(this.lockFile);
    } catch (err) {
      // Lock already released
    }
  }

  async addMessage(message: string): Promise<void> {
    if (!(await this.acquireLock())) {
      throw new Error("Could not acquire queue lock");
    }

    try {
      const messages = this.readMessages();
      messages.push({
        text: message,
        timestamp: new Date().toISOString(),
      });
      fs.writeFileSync(this.queueFile, JSON.stringify(messages, null, 2));
    } finally {
      this.releaseLock();
    }
  }

  async getAndClearMessages(): Promise<
    Array<{ text: string; timestamp: string }>
  > {
    if (!(await this.acquireLock())) {
      throw new Error("Could not acquire queue lock");
    }

    try {
      const messages = this.readMessages();
      if (messages.length > 0) {
        fs.writeFileSync(this.queueFile, JSON.stringify([], null, 2));
      }
      return messages;
    } finally {
      this.releaseLock();
    }
  }

  async peekMessages(): Promise<Array<{ text: string; timestamp: string }>> {
    if (!(await this.acquireLock())) {
      throw new Error("Could not acquire queue lock");
    }

    try {
      return this.readMessages();
    } finally {
      this.releaseLock();
    }
  }

  private readMessages(): Array<{ text: string; timestamp: string }> {
    try {
      if (fs.existsSync(this.queueFile)) {
        const content = fs.readFileSync(this.queueFile, "utf-8");
        return JSON.parse(content);
      }
    } catch (err) {
      // Invalid JSON or read error
    }
    return [];
  }

  getQueueSize(): number {
    try {
      return this.readMessages().length;
    } catch {
      return 0;
    }
  }
}
