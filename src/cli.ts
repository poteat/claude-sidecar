#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import inquirer from "inquirer";
import { MessageQueue } from "./lib/queue.js";
import { InputReader } from "./lib/input.js";
import { handlePreToolStep } from "./lib/hook.js";

const program = new Command();

program
  .name("claude-sidecar")
  .description("Interactive steering for Claude Code during tool execution")
  .version("0.1.0");

program
  .command("start")
  .description("Start the interactive input session")
  .action(() => {
    const queue = new MessageQueue();
    const reader = new InputReader(queue);
    reader.start();
  });

program
  .command("hook")
  .description("Hook handler for Claude Code (called automatically)")
  .action(async () => {
    await handlePreToolStep();
  });

program
  .command("init")
  .description("Initialize Claude Sidecar with Claude Code")
  .action(async () => {
    console.log(chalk.bold.blue("🔧 Claude Sidecar Setup"));
    console.log(chalk.gray("─".repeat(50)));

    const settingsPath = path.join(
      os.homedir(),
      ".claude",
      "settings.json"
    );
    const settingsDir = path.dirname(settingsPath);

    // Check if Claude Code settings exist
    if (!fs.existsSync(settingsDir)) {
      console.log(
        chalk.yellow("⚠️  Claude settings directory not found.")
      );
      console.log(chalk.gray(`Expected at: ${settingsDir}`));

      const { createDir } = await inquirer.prompt([
        {
          type: "confirm",
          name: "createDir",
          message: "Create Claude settings directory?",
          default: true,
        },
      ]);

      if (createDir) {
        fs.mkdirSync(settingsDir, { recursive: true });
        console.log(chalk.green("✓ Created settings directory"));
      } else {
        console.log(chalk.red("Setup cancelled"));
        process.exit(1);
      }
    }

    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, "utf-8");
        settings = JSON.parse(content);
        console.log(chalk.green("✓ Found existing Claude Code settings"));
      } catch (err) {
        console.log(chalk.yellow("⚠️  Could not parse existing settings"));
        settings = {};
      }
    }

    // Check for existing hooks
    const hasExistingHook = settings.hooks?.PreToolUse?.some((entry: any) => 
      entry.hooks?.some((hook: any) => 
        hook.command === "claude-sidecar hook"
      )
    );

    if (hasExistingHook) {
      console.log(chalk.green("\n✓ Claude Sidecar hook already configured"));
      process.exit(0);
    }

    // Initialize hooks structure if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }

    // Check if there's already a matcher for "*"
    let wildcardMatcher = settings.hooks.PreToolUse.find((entry: any) => entry.matcher === "*");
    
    if (wildcardMatcher) {
      // Add to existing wildcard matcher
      console.log(chalk.yellow("\n⚠️  Found existing wildcard matcher with hooks"));
      console.log(chalk.gray("  Will add Claude Sidecar to existing hooks"));
      
      if (!wildcardMatcher.hooks) {
        wildcardMatcher.hooks = [];
      }
      
      // Show existing hooks
      if (wildcardMatcher.hooks.length > 0) {
        console.log(chalk.gray("\n  Existing hooks:"));
        wildcardMatcher.hooks.forEach((hook: any, idx: number) => {
          console.log(chalk.gray(`    ${idx + 1}. ${hook.command || hook.type}`));
        });
      }
      
      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "Add Claude Sidecar hook to existing configuration?",
          default: true,
        },
      ]);

      if (!proceed) {
        console.log(chalk.yellow("\n📝 Manual Setup Required:"));
        console.log(chalk.gray("Add this to the PreToolUse section in your Claude settings.json:"));
        console.log(chalk.cyan('        {'));
        console.log(chalk.cyan('          "type": "command",'));
        console.log(chalk.cyan('          "command": "claude-sidecar hook"'));
        console.log(chalk.cyan('        }'));
        process.exit(0);
      }
      
      // Add our hook to the existing wildcard matcher
      wildcardMatcher.hooks.push({
        type: "command",
        command: "claude-sidecar hook"
      });
    } else {
      // No wildcard matcher exists, create a new one
      console.log(chalk.gray("\n  Creating new hook configuration"));
      
      settings.hooks.PreToolUse.push({
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: "claude-sidecar hook"
          }
        ]
      });
    }

    // Write updated settings
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(chalk.green("\n✓ Claude Sidecar successfully configured!"));
      console.log(chalk.gray(`  Settings updated at: ${settingsPath}`));

      console.log(chalk.bold.cyan("\n📚 Usage:"));
      console.log(chalk.gray("  1. Start Claude Code in one terminal"));
      console.log(
        chalk.gray('  2. Run "claude-sidecar start" in another terminal')
      );
      console.log(
        chalk.gray(
          "  3. Type feedback that will be sent to Claude at the next tool step"
        )
      );
    } catch (err) {
      console.log(chalk.red(`✗ Failed to update settings: ${err}`));
      console.log(chalk.yellow("\n📝 Manual Setup Required:"));
      console.log(chalk.gray("Add this to your Claude settings.json:"));
      console.log(chalk.cyan('\n"hooks": {'));
      console.log(chalk.cyan('  "PreToolUse": ['));
      console.log(chalk.cyan('    {'));
      console.log(chalk.cyan('      "matcher": "*",'));
      console.log(chalk.cyan('      "hooks": ['));
      console.log(chalk.cyan('        {'));
      console.log(chalk.cyan('          "type": "command",'));
      console.log(chalk.cyan('          "command": "claude-sidecar hook"'));
      console.log(chalk.cyan('        }'));
      console.log(chalk.cyan('      ]'));
      console.log(chalk.cyan('    }'));
      console.log(chalk.cyan('  ]'));
      console.log(chalk.cyan("}"));
    }
  });

program
  .command("status")
  .description("Show current queue status")
  .action(async () => {
    const queue = new MessageQueue();
    const messages = await queue.peekMessages();

    console.log(chalk.bold.cyan("📊 Claude Sidecar Queue Status"));
    console.log(chalk.gray("─".repeat(50)));

    if (messages.length === 0) {
      console.log(chalk.gray("Queue is empty"));
    } else {
      console.log(
        chalk.green(
          `${messages.length} message${
            messages.length !== 1 ? "s" : ""
          } in queue:`
        )
      );
      console.log();
      messages.forEach((msg, idx) => {
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        console.log(chalk.gray(`${idx + 1}. [${timestamp}]`) + ` ${msg.text}`);
      });
    }
  });

program
  .command("clear")
  .description("Clear all queued messages")
  .action(async () => {
    const queue = new MessageQueue();
    const messages = await queue.getAndClearMessages();

    if (messages.length === 0) {
      console.log(chalk.gray("Queue was already empty"));
    } else {
      console.log(
        chalk.yellow(
          `✓ Cleared ${messages.length} message${
            messages.length !== 1 ? "s" : ""
          } from queue`
        )
      );
    }
  });

// Default action (show help)
if (process.argv.length === 2) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
