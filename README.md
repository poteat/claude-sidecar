# Claude Sidecar

Interactive steering for Claude Code during tool execution. Provide real-time feedback to Claude without interrupting long-running tasks.

## The Problem

When Claude Code is executing a complex multi-step task (like a 108-second operation with many tool calls), users currently have only two options:

1. Press `[ESC]` to interrupt completely
2. Wait for the entire operation to finish

Claude Sidecar solves this by allowing you to queue feedback messages that are delivered to Claude at the next tool step, enabling mid-execution guidance without interruption.

## Installation

### Global Installation (from npm)

```bash
# Install globally via npm
npm install -g claude-sidecar

# Initialize (one-time setup)
claude-sidecar init
```

## Usage

### Two Terminal Setup

1. **Terminal 1**: Run Claude Code normally

   ```bash
   claude-code
   ```

2. **Terminal 2**: Start Claude Sidecar
   ```bash
   claude-sidecar start
   ```

### Interactive Commands

While Claude Sidecar is running:

- Type any message and press Enter to queue it for Claude
- `status` - View all queued messages
- `clear` - Clear the message queue
- `exit` - Quit Claude Sidecar

### CLI Commands

```bash
claude-sidecar start    # Start interactive input session
claude-sidecar status   # Show current queue status
claude-sidecar clear    # Clear all queued messages
claude-sidecar init     # Configure Claude Code integration
claude-sidecar --help   # Show all commands
```

## How It Works

1. **Message Queue**: Your feedback is stored in `~/.claude-sidecar/queue.json`
2. **PreToolUse Hook**: Claude Code calls `claude-sidecar hook` before each tool execution
3. **Stderr Output**: Queued messages are output to stderr with exit code 2 to block the tool and pipe feedback to Claude
4. **Automatic Clearing**: Messages are cleared after being delivered

## Manual Configuration

If automatic setup fails, add this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "claude-sidecar hook"
          }
        ]
      }
    ]
  }
}
```

Note: The init command will preserve your existing hooks and only add claude-sidecar if it's not already configured.

## Example Workflow

1. Claude starts a complex refactoring task
2. You notice it's heading in the wrong direction
3. In the Sidecar terminal, you type: "Focus on the authentication module first"
4. At the next tool step, Claude receives your feedback and adjusts

## Architecture

- **TypeScript**: Fully typed for reliability
- **File-based Queue**: Simple, persistent message storage
- **Lock Files**: Prevents race conditions between processes
- **Minimal Dependencies**: Fast startup, low overhead

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-sidecar.git
cd claude-sidecar

# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Test locally
node dist/cli.js start
```

## Requirements

- Node.js >= 18.0.0
- Claude Code installed and configured

## License

MIT
