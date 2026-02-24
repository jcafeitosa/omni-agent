import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";

/**
 * Compacts the conversation history to save tokens.
 * Currently a placeholder for future implementation of summaries.
 */
export class CompactCommand implements SlashCommand {
    name = "compact";
    description = "Compact session history to save context space (summarization)";

    async *execute(context: CommandContext): CommandResponse {
        yield {
            type: 'status',
            subtype: 'info',
            message: 'Compacting history...',
            uuid: randomUUID()
        };

        const result = context.loop.compactNow();

        yield {
            type: 'text',
            text: `History compacted. removed=${result.removedMessagesCount}, estimated_tokens=${result.newTokenCount}.`,
            uuid: randomUUID()
        };

        yield {
            type: 'result',
            subtype: 'success',
            result: 'history compacted',
            uuid: randomUUID()
        };
    }
}
