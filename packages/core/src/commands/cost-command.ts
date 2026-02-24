import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";

/**
 * Shows the token usage and approximate cost of the current session.
 */
export class CostCommand implements SlashCommand {
    name = "cost";
    description = "Show current session token usage and approximate USD cost";

    async *execute(context: CommandContext): CommandResponse {
        const session = (context.loop as any).session;
        const usage = session.getUsage();
        const cost = session.calculateApproximateCost();

        let costText = "Current Session Cost:\n";
        costText += `  Input Tokens:   ${usage.inputTokens.toLocaleString()}\n`;
        costText += `  Output Tokens:  ${usage.outputTokens.toLocaleString()}\n`;
        if (usage.thinkingTokens) {
            costText += `  Thinking:       ${usage.thinkingTokens.toLocaleString()}\n`;
        }
        costText += `  --------------------------\n`;
        costText += `  Estimated Cost: $${cost.toFixed(4)} USD\n`;

        yield {
            type: 'text',
            text: costText,
            uuid: randomUUID()
        };

        yield {
            type: 'result',
            subtype: 'success',
            result: 'displayed cost',
            uuid: randomUUID()
        };
    }
}
