import { spawn } from "child_process";
import * as path from "path";
import { MessageQueue } from "../lib/queue";

describe("CLI Integration Tests", () => {
  const cliPath = path.join(process.cwd(), "dist", "cli.js");

  beforeEach(async () => {
    // Simply clear the queue using the MessageQueue API
    const queue = new MessageQueue();
    await queue.getAndClearMessages();
  });

  afterEach(async () => {
    // Clean up using the MessageQueue API
    const queue = new MessageQueue();
    await queue.getAndClearMessages();
  });

  function runCLI(
    args: string[]
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      const child = spawn("node", [cliPath, ...args], {
        env: { ...process.env, NODE_OPTIONS: "--experimental-vm-modules" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, code });
      });

      // For interactive commands, send exit immediately
      if (args[0] === "start") {
        // Wait for the process to be ready then send exit
        setImmediate(() => {
          child.stdin.write("/exit\n");
        });
      }
    });
  }

  describe("help command", () => {
    it("should display help when no arguments provided", async () => {
      const { stdout } = await runCLI([]);

      expect(stdout).toContain("claude-sidecar");
      expect(stdout).toContain("Interactive steering for Claude Code");
      expect(stdout).toContain("Commands:");
      expect(stdout).toContain("start");
      expect(stdout).toContain("hook");
      expect(stdout).toContain("init");
      expect(stdout).toContain("status");
      expect(stdout).toContain("clear");
    });

    it("should display help with --help flag", async () => {
      const { stdout } = await runCLI(["--help"]);

      expect(stdout).toContain("claude-sidecar");
      expect(stdout).toContain("Commands:");
    });

    it("should display version with --version flag", async () => {
      const { stdout } = await runCLI(["--version"]);

      expect(stdout).toContain("1.0.0");
    });
  });

  describe("status command", () => {
    it("should show empty queue status", async () => {
      const { stdout } = await runCLI(["status"]);

      expect(stdout).toContain("Claude Sidecar Queue Status");
      expect(stdout).toContain("Queue is empty");
    });

    it("should show messages in queue", async () => {
      const queue = new MessageQueue();
      await queue.addMessage("Test message 1");
      await queue.addMessage("Test message 2");

      const { stdout } = await runCLI(["status"]);

      expect(stdout).toContain("2 messages in queue");
      expect(stdout).toContain("Test message 1");
      expect(stdout).toContain("Test message 2");
    });
  });

  describe("clear command", () => {
    it("should clear empty queue", async () => {
      const { stdout } = await runCLI(["clear"]);

      expect(stdout).toContain("Queue was already empty");
    });

    it("should clear messages from queue", async () => {
      const queue = new MessageQueue();
      await queue.addMessage("To be cleared");

      const { stdout } = await runCLI(["clear"]);

      expect(stdout).toContain("Cleared 1 message from queue");

      // Verify queue is empty
      const remainingMessages = await queue.peekMessages();
      expect(remainingMessages).toHaveLength(0);
    });

    it("should handle multiple messages", async () => {
      const queue = new MessageQueue();
      await queue.addMessage("Message 1");
      await queue.addMessage("Message 2");
      await queue.addMessage("Message 3");

      const { stdout } = await runCLI(["clear"]);

      expect(stdout).toContain("Cleared 3 messages from queue");
    });
  });

  describe("hook command", () => {
    it("should output messages to stderr", async () => {
      const queue = new MessageQueue();
      await queue.addMessage("Hook test message");

      const { stderr, code } = await runCLI(["hook"]);

      expect(stderr).toContain("=== User Feedback from Claude Sidecar ===");
      expect(stderr).toContain("[1/1] Hook test message");
      expect(stderr).toContain("==========================================");
      expect(code).toBe(2); // Exit code 2 when messages exist to block tool call

      // Verify queue was cleared
      const remainingMessages = await queue.peekMessages();
      expect(remainingMessages).toHaveLength(0);
    });

    it("should handle empty queue silently", async () => {
      const { stderr, stdout, code } = await runCLI(["hook"]);

      // Should not output anything
      expect(stderr).not.toContain("User Feedback");
      expect(stdout).toBe("");
      expect(code).toBe(0);
    });
  });

  describe("start command", () => {
    it("should start interactive session and exit", async () => {
      const { stdout } = await runCLI(["start"]);

      expect(stdout).toContain("Claude Sidecar - Interactive Steering");
      expect(stdout).toContain("Type your feedback");
    }, 10000);
  });

  describe("init command", () => {
    it("should display setup message", async () => {
      // We can't fully test init because it's interactive
      // But we can verify it starts correctly
      const child = spawn("node", [cliPath, "init"], {
        env: { ...process.env, NODE_OPTIONS: "--experimental-vm-modules" },
      });

      let stdout = "";
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      // Kill the process immediately after getting initial output
      await new Promise((resolve) => {
        child.stdout.once("data", () => {
          setImmediate(() => {
            child.kill();
            resolve(undefined);
          });
        });
      });

      // Check for the setup message (with or without emoji)
      expect(stdout).toMatch(/Claude Sidecar Setup/);
    }, 10000);
  });

  describe("error handling", () => {
    it("should handle invalid commands gracefully", async () => {
      const { stderr } = await runCLI(["invalid-command"]);

      expect(stderr).toContain("error: unknown command 'invalid-command'");
    });
  });
});
