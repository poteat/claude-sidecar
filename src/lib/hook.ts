#!/usr/bin/env node
import { MessageQueue } from "./queue.js";

export async function handlePreToolStep(): Promise<void> {
  const queue = new MessageQueue();

  try {
    const messages = await queue.getAndClearMessages();

    if (messages.length > 0) {
      // Output to stderr in a format Claude can understand
      console.error("=== User Feedback from Claude Sidecar ===");

      messages.forEach((msg, idx) => {
        console.error(`[${idx + 1}/${messages.length}] ${msg.text}`);
      });

      console.error("==========================================");
      
      // Exit with code 2 to block the tool call and pipe stderr to Claude
      process.exit(2);
    }
  } catch (err) {
    // Silently fail to not disrupt Claude's operation
    // Could optionally log to a file for debugging
  }

  // Exit with 0 when no messages (don't block)
  process.exit(0);
}
