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

  private async acquireLock(maxRetries = 20): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if lock file exists and if it's stale (older than 5 seconds)
        if (fs.existsSync(this.lockFile)) {
          const stats = fs.statSync(this.lockFile);
          const age = Date.now() - stats.mtimeMs;
          if (age > 5000) {
            // Remove stale lock
            try {
              fs.unlinkSync(this.lockFile);
            } catch {
              // Ignore if already removed
            }
          }
        }

        fs.writeFileSync(this.lockFile, process.pid.toString(), { flag: "wx" });
        return true;
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 100));
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

  async getQueueSize(): Promise<number> {
    // Try to get size without lock first for performance
    try {
      if (fs.existsSync(this.queueFile)) {
        const content = fs.readFileSync(this.queueFile, "utf-8");
        const messages = JSON.parse(content);
        return messages.length;
      }
    } catch {
      // If there's an error reading, return 0
    }
    return 0;
  }
}
