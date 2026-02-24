import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";

export class AgentsCommand implements SlashCommand {
    name = "agents";
    description = "List available agent definitions";

    async *execute(context: CommandContext): CommandResponse {
        const loop = context.loop as any;
        const manager = loop.agentManager;
        if (!manager || typeof manager.getAllDefinitions !== "function") {
            yield {
                type: "result",
                subtype: "error",
                result: "Agent manager is not configured for this session.",
                uuid: randomUUID()
            };
            return;
        }

        const defs = manager.getAllDefinitions();
        const lines = defs.map((d: any) => `- ${d.manifest.name}: ${d.manifest.description || ""}`.trim());
        yield {
            type: "text",
            text: lines.length ? lines.join("\n") : "No agents loaded.",
            uuid: randomUUID()
        };
        yield {
            type: "result",
            subtype: "success",
            result: `listed ${defs.length} agents`,
            uuid: randomUUID()
        };
    }
}

