import { z } from "zod";
import { ToolDefinition } from "../index.js";
import { AgentManager } from "../state/agent-manager.js";

/**
 * Creates a tool that allows an agent to spawn subagents.
 * Highly aligned with Claude Agent SDK's subagent orchestration patterns.
 */
export function subagentTool(agentManager: AgentManager): ToolDefinition {
    return {
        name: "subagent",
        description: "Spawn a specialized subagent to handle a sub-task. You can specify a named agent or provide a custom definition.",
        parameters: z.object({
            query: z.string().describe("The task or query for the subagent"),
            agentName: z.string().optional().describe("Name of a pre-defined agent to use"),
            customDefinition: z.object({
                prompt: z.string().describe("System prompt for the custom subagent"),
                tools: z.array(z.string()).optional().describe("List of tools to allow"),
                disallowedTools: z.array(z.string()).optional().describe("List of tools to explicitly disallow"),
                model: z.string().optional().describe("Model override for the subagent"),
            }).optional()
        }),
        execute: async ({ query, agentName, customDefinition }) => {
            if (!agentName && !customDefinition) {
                throw new Error("Either agentName or customDefinition must be provided to spawn a subagent.");
            }

            const definition = agentName || customDefinition;

            // Note: In a production scenario, we'd want to pass the current loop's tools
            // to allow deep inheritance.
            const subAgent = agentManager.createAgent(definition as any);

            // Run the subagent and return its final result
            const result = await subAgent.run(query);
            return result;
        }
    };
}
