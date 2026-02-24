import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";

/**
 * Lists all available slash commands.
 */
export class HelpCommand implements SlashCommand {
    name = "help";
    description = "List all available slash commands";

    async *execute(context: CommandContext): CommandResponse {
        const commands = (context.loop as any).commandRegistry?.getAll() as SlashCommand[];
        let helpText = "Available Commands:\n";
        for (const cmd of commands) {
            helpText += `  /${cmd.name.padEnd(10)} - ${cmd.description}\n`;
        }

        yield {
            type: 'text',
            text: helpText,
            uuid: randomUUID()
        };

        yield {
            type: 'result',
            subtype: 'success',
            result: 'displayed help',
            uuid: randomUUID()
        };
    }
}
