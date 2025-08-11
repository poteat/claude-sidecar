import * as readline from "readline";
import { MessageQueue } from "./queue.js";
import chalk from "chalk";

export class InputReader {
  private rl: readline.Interface;
  private queue: MessageQueue;
  private isRunning: boolean = false;

  constructor(queue: MessageQueue) {
    this.queue = queue;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("> "),
    });
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.clear();
    console.log(chalk.bold.green("🚀 Claude Sidecar - Interactive Steering"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(
      chalk.yellow("Type your feedback and press Enter to queue it.")
    );
    console.log(chalk.yellow("Messages will be sent at the next tool step."));
    console.log(chalk.gray('Type "exit" to quit, "status" to see queue info'));
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    this.rl.prompt();

    this.rl.on("line", async (input) => {
      const trimmed = input.trim();

      if (trimmed === "") {
        this.rl.prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit") {
        this.stop();
        return;
      }

      if (trimmed.toLowerCase() === "status") {
        await this.showStatus();
        this.rl.prompt();
        return;
      }

      if (trimmed.toLowerCase() === "clear") {
        await this.clearQueue();
        this.rl.prompt();
        return;
      }

      try {
        await this.queue.addMessage(trimmed);
        const queueSize = this.queue.getQueueSize();
        console.log(
          chalk.green(
            `✓ Message queued (${queueSize} message${
              queueSize !== 1 ? "s" : ""
            } in queue)`
          )
        );
      } catch (err) {
        console.log(chalk.red(`✗ Failed to queue message: ${err}`));
      }

      this.rl.prompt();
    });

    this.rl.on("SIGINT", () => {
      console.log(chalk.yellow("\n\nReceived SIGINT, exiting..."));
      this.stop();
    });
  }

  private async showStatus(): Promise<void> {
    try {
      const messages = await this.queue.peekMessages();
      console.log(
        chalk.cyan(
          `\n📊 Queue Status: ${messages.length} message${
            messages.length !== 1 ? "s" : ""
          }`
        )
      );

      if (messages.length > 0) {
        console.log(chalk.gray("─".repeat(40)));
        messages.forEach((msg, idx) => {
          const timestamp = new Date(msg.timestamp).toLocaleTimeString();
          console.log(chalk.gray(`[${timestamp}]`) + ` ${msg.text}`);
        });
        console.log(chalk.gray("─".repeat(40)));
      }
    } catch (err) {
      console.log(chalk.red(`Failed to get status: ${err}`));
    }
  }

  private async clearQueue(): Promise<void> {
    try {
      await this.queue.getAndClearMessages();
      console.log(chalk.yellow("✓ Queue cleared"));
    } catch (err) {
      console.log(chalk.red(`Failed to clear queue: ${err}`));
    }
  }

  stop(): void {
    this.isRunning = false;
    this.rl.close();
    process.exit(0);
  }
}
