import WebSocket from "ws";
import { MessageQueue } from "./queue.js";
import chalk from "chalk";
import { execSync, spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const recorder = require("node-record-lpcm16");

export class RealtimeVoiceHandler {
  private ws: WebSocket | null = null;
  private queue: MessageQueue;
  private isListening: boolean = false;
  private recording: any = null;
  private isConnected: boolean = false;
  private currentTranscript: string = "";
  private audioConverter: any = null;

  constructor(queue: MessageQueue) {
    this.queue = queue;
  }

  /**
   * Check if SoX and ffmpeg are installed
   */
  private checkDependencies(): { ok: boolean; missing: string[] } {
    const missing: string[] = [];

    try {
      execSync("which sox", { stdio: "ignore" });
    } catch {
      missing.push("sox");
    }

    try {
      execSync("which ffmpeg", { stdio: "ignore" });
    } catch {
      missing.push("ffmpeg");
    }

    return { ok: missing.length === 0, missing };
  }

  /**
   * Check if OpenAI API key is configured
   */
  checkCredentials(): { configured: boolean; error?: string } {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        configured: false,
        error: "OPENAI_API_KEY environment variable not set",
      };
    }

    return { configured: true };
  }

  /**
   * Connect to OpenAI Realtime API
   */
  private async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const apiKey = process.env.OPENAI_API_KEY;
      const url =
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

      console.log(chalk.gray("Connecting to OpenAI Realtime API..."));

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      this.ws.on("open", () => {
        console.log(chalk.green("✓ Connected to Realtime API"));
        this.isConnected = true;
        this.configureSession();
        resolve(true);
      });

      this.ws.on("message", (data: Buffer) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      this.ws.on("error", (error) => {
        console.error(chalk.red(`WebSocket error: ${error.message}`));
        this.isConnected = false;
        resolve(false);
      });

      this.ws.on("close", () => {
        console.log(chalk.yellow("Disconnected from Realtime API"));
        this.isConnected = false;
      });

      // Timeout connection attempt
      setTimeout(() => {
        if (!this.isConnected) {
          console.error(chalk.red("Connection timeout"));
          if (this.ws) {
            this.ws.close();
          }
          resolve(false);
        }
      }, 5000);
    });
  }

  /**
   * Configure session for transcription-only mode
   */
  private configureSession(): void {
    if (!this.ws || !this.isConnected) return;

    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text"], // Text output only
        instructions:
          "You are a transcription service for developers providing feedback to Claude Code. Transcribe exactly what the user says.",
        input_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1", // Transcription model
          language: "en", // Force English transcription
          prompt:
            "The user is a developer providing feedback or guidance to Claude Code during software development.",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: [],
        tool_choice: "none",
        temperature: 0.6, // Minimum allowed temperature for GPT-4o Realtime
        max_response_output_tokens: 1, // Minimize response generation
      },
    };

    this.ws.send(JSON.stringify(sessionConfig));
  }

  /**
   * Handle WebSocket messages
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case "session.created":
      case "session.updated":
        // Session ready
        break;

      case "conversation.item.created":
        if (
          message.item?.role === "user" &&
          message.item?.formatted?.transcript
        ) {
          // Clear any partial transcript when finalized
          if (this.currentTranscript) {
            process.stdout.write("\r\x1b[2K"); // Clear line
          }
          this.currentTranscript = "";

          const transcript = message.item.formatted.transcript;
          this.queueMessage(transcript);
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        // Final transcription completed
        if (message.transcript) {
          if (this.currentTranscript) {
            process.stdout.write("\r\x1b[2K"); // Clear line
          }
          this.currentTranscript = "";
          this.queueMessage(message.transcript);
        }
        break;

      case "conversation.item.input_audio_transcription.failed":
        console.log(chalk.red("✗ Transcription failed"));
        this.currentTranscript = "";
        break;

      case "input_audio_buffer.speech_started":
        console.log(chalk.gray("\n[Listening...]"));
        break;

      case "input_audio_buffer.speech_stopped":
        // Speech ended, transcription will follow
        break;

      case "input_audio_buffer.committed":
        // Audio committed for processing
        break;

      case "error":
        console.error(
          chalk.red(`API Error: ${message.error?.message || "Unknown error"}`)
        );
        break;

      case "response.audio_transcript.delta":
      case "response.audio.delta":
      case "response.text.delta":
      case "response.output_item.added":
      case "response.created":
        // Ignore AI response events - we're transcription only
        break;

      default:
        // Uncomment for debugging new message types
        // console.log(chalk.gray(`[${message.type}]`));
        break;
    }
  }

  /**
   * Queue a transcribed message
   */
  private async queueMessage(text: string): Promise<void> {
    const cleaned = text.trim();
    if (!cleaned || cleaned.length < 2) return;

    try {
      await this.queue.addMessage(cleaned);
      const queueSize = await this.queue.getQueueSize();

      console.log(chalk.green(`✓ Transcribed: "${cleaned}"`));
      console.log(
        chalk.gray(
          `  (${queueSize} message${queueSize !== 1 ? "s" : ""} in queue)`
        )
      );
    } catch (err: any) {
      if (err.message?.includes("lock")) {
        console.log(chalk.yellow(`\n⚠ Queue busy, retrying...`));
        setTimeout(async () => {
          try {
            await this.queue.addMessage(cleaned);
            console.log(chalk.green(`✓ Queued on retry: "${cleaned}"`));
          } catch (retryErr) {
            console.log(chalk.red(`✗ Failed to queue: ${retryErr}`));
          }
        }, 500);
      } else {
        console.log(chalk.red(`✗ Failed to queue: ${err}`));
      }
    }
  }

  /**
   * Start audio recording and streaming
   */
  private startRecording(): void {
    if (!this.ws || !this.isConnected) return;

    // Set up ffmpeg to convert from 16kHz to 24kHz
    this.audioConverter = spawn(
      "ffmpeg",
      [
        "-f",
        "s16le", // Input format: 16-bit PCM
        "-ar",
        "16000", // Input sample rate: 16kHz
        "-ac",
        "1", // Input channels: mono
        "-i",
        "pipe:0", // Input from stdin
        "-f",
        "s16le", // Output format: 16-bit PCM
        "-ar",
        "24000", // Output sample rate: 24kHz
        "-ac",
        "1", // Output channels: mono
        "pipe:1", // Output to stdout
      ],
      {
        stdio: ["pipe", "pipe", "ignore"], // Ignore stderr
      }
    );

    // Record audio at 16kHz (SoX default)
    this.recording = recorder.record({
      sampleRateHertz: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: "rec",
      silence: "1.0",
    });

    // Pipe recording through ffmpeg to WebSocket
    this.recording
      .stream()
      .on("error", (err: any) => {
        if (err.code === "ENOENT") {
          console.log(chalk.red("\n❌ SoX not found - please install it"));
        } else {
          console.error(chalk.red(`\nRecording error: ${err.message}`));
        }
        this.stopListening();
      })
      .pipe(this.audioConverter.stdin);

    // Send converted audio to WebSocket
    this.audioConverter.stdout.on("data", (chunk: Buffer) => {
      if (this.isConnected && this.ws && this.isListening) {
        this.sendAudioChunk(chunk);
      }
    });

    this.audioConverter.on("error", (err: any) => {
      console.error(chalk.red(`Audio conversion error: ${err.message}`));
      this.stopListening();
    });
  }

  /**
   * Send audio chunk to WebSocket
   */
  private sendAudioChunk(chunk: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const event = {
      type: "input_audio_buffer.append",
      audio: chunk.toString("base64"),
    };

    this.ws.send(JSON.stringify(event));
  }

  /**
   * Start listening for voice input
   */
  async startListening(): Promise<void> {
    // Check dependencies
    const deps = this.checkDependencies();
    if (!deps.ok) {
      console.log(chalk.red("\n❌ Missing required tools:"));
      for (const tool of deps.missing) {
        if (tool === "sox") {
          console.log(chalk.yellow("  • SoX - install with: brew install sox"));
        } else if (tool === "ffmpeg") {
          console.log(
            chalk.yellow("  • ffmpeg - install with: brew install ffmpeg")
          );
        }
      }
      return;
    }

    // Check credentials
    const credCheck = this.checkCredentials();
    if (!credCheck.configured) {
      console.log(chalk.red("\n❌ OpenAI API key not configured"));
      console.log(chalk.yellow("\nTo use voice input:"));
      console.log(chalk.cyan("  export OPENAI_API_KEY=your-api-key"));
      console.log(
        chalk.gray(
          "\nGet your API key from: https://platform.openai.com/api-keys"
        )
      );
      return;
    }

    // Connect to WebSocket
    const connected = await this.connect();
    if (!connected) {
      console.log(chalk.red("\n❌ Failed to connect to OpenAI Realtime API"));
      return;
    }

    console.log(chalk.green(`\n🎤 Voice input active (GPT-4o Realtime)`));
    console.log(
      chalk.gray("Speak naturally - using server-side voice detection")
    );
    console.log(chalk.gray("Press ESC or type /listen again to stop\n"));

    this.isListening = true;
    this.startRecording();
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    this.isListening = false;

    // Stop recording
    if (this.recording) {
      this.recording.stop();
      this.recording = null;
    }

    // Stop audio converter
    if (this.audioConverter) {
      this.audioConverter.kill();
      this.audioConverter = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }

    console.log(chalk.yellow("\n🎤 Voice input stopped"));
  }

  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}
