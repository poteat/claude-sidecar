import { jest } from "@jest/globals";
import { handlePreToolStep } from "../lib/hook";
import { MessageQueue } from "../lib/queue";

// Mock process.exit
const mockExit = jest.spyOn(process, "exit").mockImplementation(((
  code?: number
) => {
  throw new Error("process.exit called");
}) as any);

// Mock console.error
const mockConsoleError = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});

describe("handlePreToolStep", () => {
  let queue: MessageQueue;

  beforeEach(async () => {
    queue = new MessageQueue();
    // Ensure queue is empty
    await queue.getAndClearMessages();
    mockConsoleError.mockClear();
    mockExit.mockClear();
  });

  afterEach(async () => {
    // Clean up using MessageQueue
    await queue.getAndClearMessages();
  });

  it("should output messages to stderr and clear queue", async () => {
    // Add some messages to the queue
    await queue.addMessage("First feedback");
    await queue.addMessage("Second feedback");

    // Run the hook handler
    await expect(handlePreToolStep()).rejects.toThrow("process.exit called");

    // Check that messages were output to stderr
    expect(mockConsoleError).toHaveBeenCalledWith(
      "=== User Feedback from Claude Sidecar ==="
    );
    expect(mockConsoleError).toHaveBeenCalledWith("[1/2] First feedback");
    expect(mockConsoleError).toHaveBeenCalledWith("[2/2] Second feedback");
    expect(mockConsoleError).toHaveBeenCalledWith(
      "=========================================="
    );

    // Check that process.exit was called with code 2 (to block and pipe stderr)
    expect(mockExit).toHaveBeenCalledWith(2);

    // Check that queue was cleared (getAndClearMessages is called in handlePreToolStep)
    // Create a new queue instance to check the file state
    const newQueue = new MessageQueue();
    const remainingMessages = await newQueue.peekMessages();
    expect(remainingMessages).toHaveLength(0);
  });

  it("should handle empty queue silently", async () => {
    // Run hook with empty queue
    await expect(handlePreToolStep()).rejects.toThrow("process.exit called");

    // Should not output anything to stderr
    expect(mockConsoleError).not.toHaveBeenCalled();

    // Should still exit cleanly
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should handle single message correctly", async () => {
    await queue.addMessage("Single feedback");

    await expect(handlePreToolStep()).rejects.toThrow("process.exit called");

    expect(mockConsoleError).toHaveBeenCalledWith("[1/1] Single feedback");
    expect(mockExit).toHaveBeenCalledWith(2);
  });

  it("should handle queue errors gracefully", async () => {
    // Mock the getAndClearMessages to simulate an error
    const originalMethod = MessageQueue.prototype.getAndClearMessages;
    MessageQueue.prototype.getAndClearMessages = jest.fn(() =>
      Promise.reject(new Error("Lock error"))
    ) as any;

    await expect(handlePreToolStep()).rejects.toThrow("process.exit called");

    // Should not output anything on error
    expect(mockConsoleError).not.toHaveBeenCalled();

    // Should still exit
    expect(mockExit).toHaveBeenCalledWith(0);

    // Restore original method
    MessageQueue.prototype.getAndClearMessages = originalMethod;
  });

  it("should format multiple messages with correct numbering", async () => {
    // Add multiple messages
    for (let i = 1; i <= 5; i++) {
      await queue.addMessage(`Message ${i}`);
    }

    await expect(handlePreToolStep()).rejects.toThrow("process.exit called");

    // Check correct formatting
    expect(mockConsoleError).toHaveBeenCalledWith("[1/5] Message 1");
    expect(mockConsoleError).toHaveBeenCalledWith("[2/5] Message 2");
    expect(mockConsoleError).toHaveBeenCalledWith("[3/5] Message 3");
    expect(mockConsoleError).toHaveBeenCalledWith("[4/5] Message 4");
    expect(mockConsoleError).toHaveBeenCalledWith("[5/5] Message 5");
    expect(mockExit).toHaveBeenCalledWith(2);
  });

  it("should handle messages with special characters", async () => {
    const specialMessage =
      "Test with \"quotes\" and 'apostrophes' and \nnewlines";
    await queue.addMessage(specialMessage);

    await expect(handlePreToolStep()).rejects.toThrow("process.exit called");

    expect(mockConsoleError).toHaveBeenCalledWith(`[1/1] ${specialMessage}`);
    expect(mockExit).toHaveBeenCalledWith(2);
  });
});
