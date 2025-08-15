# Changelog

All notable changes to claude-sidecar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-10

### 🎉 Initial Release

#### Features

- **Real-time message queuing** - Queue feedback while Claude Code executes
- **PostToolHook integration** - Seamless integration with Claude Code's hook system
- **Non-blocking operation** - Only interrupts when messages are queued
- **Interactive CLI** - User-friendly terminal interface with color-coded output
- **Smart initialization** - Preserves existing hooks when configuring
- **Queue management** - View, clear, and manage queued messages
- **File-based persistence** - Messages survive process restarts

#### Commands

- `claude-sidecar` - Start interactive input session
- `claude-sidecar init` - Configure Claude Code integration
- `claude-sidecar status` - View queued messages
- `claude-sidecar clear` - Clear message queue
- `claude-sidecar hook` - Internal hook handler (called by Claude Code)

#### Technical Details

- Written in TypeScript with full type safety
- ESM modules for modern JavaScript
- Comprehensive test suite with Jest
- File-based locking for concurrent access safety
- Non-blocking PostToolHook with stdout output
- Minimal dependencies (chalk, commander, inquirer)

#### Compatibility

- Node.js >= 18.0.0
- Claude Code with hooks support
- Works on macOS, Linux, and Windows

### Installation

```bash
npm install -g claude-sidecar
claude-sidecar init
```

[1.0.0]: https://github.com/poteat/claude-sidecar/releases/tag/v1.0.0
