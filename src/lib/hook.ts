#!/usr/bin/env node
import { MessageQueue } from "./queue.js";

export async function handlePostToolStep(): Promise<void> {
  const queue = new MessageQueue();

  try {
    const messages = await queue.getAndClearMessages();

    if (messages.length > 0) {
      // Output to stdout in a format Claude can understand for PostToolHook
      console.log("=== User Feedback from Claude Sidecar ===");

      messages.forEach((msg, idx) => {
        console.log(`[${idx + 1}/${messages.length}] ${msg.text}`);
      });

      console.log("==========================================");
    }
  } catch (err) {
    // Silently fail to not disrupt Claude's operation
    // Could optionally log to a file for debugging
  }

  // Always exit with 0 for PostToolHook (non-blocking)
  process.exit(0);
}
