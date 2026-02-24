import { SlashCommand, CommandContext, CommandResponse } from "./command-registry.js";
import { randomUUID } from "node:crypto";

/**
 * ClearCommand
 * Resets the current agent session.
 */
export class ClearCommand implements SlashCommand {
    name = "clear";
    description = "Resets the current agent session and clears message history.";

    async *execute({ loop }: CommandContext): CommandResponse {
        // @ts-ignore - session is private in AgentLoop, but we need it here
        const session = loop['session'];
        session.clear();

        yield {
            type: 'status',
            subtype: 'info',
            message: 'Session cleared successfully.',
            uuid: randomUUID()
        };

        yield {
            type: 'result',
            subtype: 'success',
            result: 'Session has been reset.',
            uuid: randomUUID()
        };
    }
}
