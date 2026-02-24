import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";

export class SkillsCommand implements SlashCommand {
    name = "skills";
    description = "List available skills discovered by AgentManager";

    async *execute(context: CommandContext): CommandResponse {
        const loop = context.loop as any;
        const manager = loop.agentManager;
        if (!manager || typeof manager.listAvailableSkills !== "function") {
            yield {
                type: "result",
                subtype: "error",
                result: "Agent manager is not configured for this session.",
                uuid: randomUUID()
            };
            return;
        }

        const skills = manager.listAvailableSkills();
        const lines = skills.map((s: any) => `- ${s.name} [${s.source}]${s.description ? `: ${s.description}` : ""}`);
        yield {
            type: "text",
            text: lines.length ? lines.join("\n") : "No skills discovered.",
            uuid: randomUUID()
        };
        yield {
            type: "result",
            subtype: "success",
            result: `listed ${skills.length} skills`,
            uuid: randomUUID()
        };
    }
}

