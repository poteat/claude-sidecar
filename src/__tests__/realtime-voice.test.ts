import { jest } from "@jest/globals";
import { MessageQueue } from "../lib/queue";
import WebSocket from "ws";

// Mock WebSocket
jest.mock("ws", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1, // OPEN
    })),
    WebSocket: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1, // OPEN
    })),
  };
});

// Mock child_process
const mockExecSync = jest.fn();
const mockSpawn = jest.fn();

jest.mock("child_process", () => ({
  execSync: mockExecSync,
  spawn: mockSpawn,
}));

// Mock node-record-lpcm16
jest.mock("module", () => ({
  createRequire: () => () => ({
    record: jest.fn(() => ({
      stream: jest.fn(() => ({
        on: jest.fn((event: string, callback: any) => {
          return { pipe: jest.fn() };
        }),
        pipe: jest.fn(),
      })),
      stop: jest.fn(),
    })),
  }),
}));

import { RealtimeVoiceHandler } from "../lib/realtime-voice";

describe("RealtimeVoiceHandler", () => {
  let voiceHandler: RealtimeVoiceHandler;
  let mockQueue: MessageQueue;

  beforeEach(() => {
    // Clear environment
    delete process.env.OPENAI_API_KEY;

    // Reset mocks
    mockExecSync.mockClear();
    mockSpawn.mockClear();
    mockSpawn.mockImplementation(() => ({
      stdin: { pipe: jest.fn() },
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
    }));

    // Create mock queue
    mockQueue = {
      addMessage: jest.fn(),
      getQueueSize: jest.fn(() => Promise.resolve(1)),
      peekMessages: jest.fn(),
      getAndClearMessages: jest.fn(),
    } as any;

    voiceHandler = new RealtimeVoiceHandler(mockQueue);
  });

  afterEach(async () => {
    // Stop any active listening
    if (voiceHandler.getIsListening()) {
      await voiceHandler.stopListening();
    }

    // Small delay to ensure async operations complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    jest.clearAllMocks();
  });

  describe("checkCredentials", () => {
    it("should return not configured when OPENAI_API_KEY is not set", () => {
      const result = voiceHandler.checkCredentials();

      expect(result.configured).toBe(false);
      expect(result.error).toContain("OPENAI_API_KEY");
    });

    it("should return configured when OPENAI_API_KEY is set", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const result = voiceHandler.checkCredentials();

      expect(result.configured).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("startListening", () => {
    it("should not start if credentials are not configured", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await voiceHandler.startListening();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("OpenAI API key not configured")
      );
      expect(voiceHandler.getIsListening()).toBe(false);

      consoleSpy.mockRestore();
    });

    it("should check for required dependencies", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // Spy on the checkDependencies method directly to return missing dependencies
      const checkDependenciesSpy = jest
        .spyOn(voiceHandler as any, "checkDependencies")
        .mockReturnValue({ ok: false, missing: ["sox", "ffmpeg"] });

      await voiceHandler.startListening();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing required tools")
      );

      consoleSpy.mockRestore();
      checkDependenciesSpy.mockRestore();
    });
  });

  describe("stopListening", () => {
    it("should do nothing if not listening", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await voiceHandler.stopListening();

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Voice input stopped")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getIsListening", () => {
    it("should return false initially", () => {
      expect(voiceHandler.getIsListening()).toBe(false);
    });
  });
});
