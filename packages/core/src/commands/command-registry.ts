import { AgentLoop } from "../loops/agent-loop.js";
import { SDKEvent } from "../types/messages.js";

export interface CommandContext {
    loop: AgentLoop;
    args: string[];
}

export type CommandResponse = AsyncGenerator<SDKEvent, void, unknown>;

export interface SlashCommand {
    name: string;
    description: string;
    execute(context: CommandContext): CommandResponse;
}

/**
 * Handles slash commands (/cost, /compact, etc.) separate from LLM turns.
 */
export class CommandRegistry {
    private commands: Map<string, SlashCommand> = new Map();

    register(command: SlashCommand) {
        this.commands.set(command.name, command);
    }

    get(name: string): SlashCommand | undefined {
        return this.commands.get(name);
    }

    getAll(): SlashCommand[] {
        return Array.from(this.commands.values());
    }

    isCommand(input: string): boolean {
        return input.trim().startsWith("/");
    }

    async *execute(input: string, loop: AgentLoop): CommandResponse {
        const parts = input.trim().slice(1).split(/\s+/);
        const name = parts[0];
        const args = parts.slice(1);

        const cmd = this.commands.get(name);
        if (!cmd) {
            const message = `Unknown command: /${name}. Type /help for available commands.`;
            const error = {
                code: "UNKNOWN_COMMAND",
                message,
                source: "command" as const
            };
            yield {
                type: 'status',
                subtype: 'error',
                message,
                error,
                uuid: crypto.randomUUID()
            };
            yield {
                type: "result",
                subtype: "error",
                result: message,
                error,
                uuid: crypto.randomUUID()
            };
            return;
        }

        yield* cmd.execute({ loop, args });
    }
}
