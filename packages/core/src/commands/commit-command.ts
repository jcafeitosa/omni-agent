import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";
import { execSync } from "child_process";

/**
 * Automates the git commit process.
 * Analyzes changes and generates a commit message using the LLM.
 */
export class CommitCommand implements SlashCommand {
    name = "commit";
    description = "Analyze changes and create a git commit with an AI-generated message";

    async *execute(context: CommandContext): CommandResponse {
        yield {
            type: 'status',
            subtype: 'progress',
            message: 'Analyzing changes...',
            uuid: randomUUID()
        };

        try {
            const diff = execSync("git diff HEAD", { encoding: "utf-8" });
            if (!diff.trim()) {
                yield { type: 'text', text: "No changes detected to commit.", uuid: randomUUID() };
                yield { type: 'result', subtype: 'success', result: 'no changes', uuid: randomUUID() };
                return;
            }

            yield {
                type: 'status',
                subtype: 'progress',
                message: 'Generating commit message...',
                uuid: randomUUID()
            };

            // Use the loop's provider to generate a message
            const prompt = `Generate a concise, conventional git commit message for the following changes:\n\n${diff.slice(0, 5000)}`;
            const response = await (context.loop as any).provider.generateText([{ role: "user", content: prompt }]);
            const message = response.text.trim().split('\n')[0]; // Take first line

            yield { type: 'text', text: `Suggested message: ${message}`, uuid: randomUUID() };

            // For now, we auto-commit like Claude Code's /commit
            // In a real CLI, we might want to prompt for confirmation.
            execSync("git add .");
            execSync(`git commit -m ${JSON.stringify(message)}`);

            yield { type: 'text', text: "Changes staged and committed successfully.", uuid: randomUUID() };
            yield { type: 'result', subtype: 'success', result: 'committed', uuid: randomUUID() };

        } catch (e: any) {
            const message = `Git error: ${e.message}`;
            yield { type: 'status', subtype: 'error', message, uuid: randomUUID() };
            yield { type: "result", subtype: "error", result: message, uuid: randomUUID() };
        }
    }
}
