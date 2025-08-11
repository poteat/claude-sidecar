import * as readline from "readline";
import { MessageQueue } from "./queue.js";
import chalk from "chalk";

export class InputReader {
  private rl: readline.Interface;
  private queue: MessageQueue;
  private isRunning: boolean = false;
  private commands = [
    { name: "/status", description: "View queued messages" },
    { name: "/clear", description: "Clear message queue" },
    { name: "/help", description: "Show available commands" },
    { name: "/exit", description: "Exit the program" },
  ];

  constructor(queue: MessageQueue) {
    this.queue = queue;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("> "),
      completer: (line: string) => this.completer(line),
    });
  }

  private completer(line: string): [string[], string] {
    if (!line.startsWith("/")) {
      return [[], line];
    }

    const completions = this.commands.map((cmd) => cmd.name);
    const hits = completions.filter((c) => c.startsWith(line));

    // Show all commands if only '/' is typed
    if (line === "/") {
      return [completions, line];
    }

    return [hits.length ? hits : completions, line];
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
    console.log(chalk.gray("Type /help for commands • Press ESC to exit"));
    console.log(chalk.gray("─".repeat(50)));
    console.log();

    this.rl.prompt();

    this.rl.on("line", async (input) => {
      const trimmed = input.trim();

      if (trimmed === "") {
        this.rl.prompt();
        return;
      }

      // Handle slash commands
      if (trimmed.startsWith("/")) {
        const command = trimmed.toLowerCase();

        switch (command) {
          case "/exit":
            this.stop();
            return;
          case "/status":
            await this.showStatus();
            break;
          case "/clear":
            await this.clearQueue();
            break;
          case "/help":
            this.showHelp();
            break;
          default:
            console.log(chalk.red(`Unknown command: ${trimmed}`));
            this.showHelp();
        }
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

    // Listen for raw keypress events for immediate ESC handling
    if (process.stdin.isTTY) {
      // Use raw stdin for ESC detection to avoid readline buffering
      process.stdin.on("data", (chunk) => {
        // ESC key is ASCII 27 (0x1B)
        if (chunk[0] === 27 && chunk.length === 1) {
          console.log(chalk.yellow("\n\nESC pressed, exiting..."));
          this.stop();
        }
      });
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan("\n📚 Available Commands:"));
    console.log(chalk.gray("─".repeat(40)));
    this.commands.forEach((cmd) => {
      console.log(
        chalk.yellow(cmd.name.padEnd(12)) + chalk.gray(cmd.description)
      );
    });
    console.log(chalk.gray("─".repeat(40)));
    console.log(chalk.gray("\nTip: Type anything else to queue as feedback"));
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
        messages.forEach((msg) => {
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
