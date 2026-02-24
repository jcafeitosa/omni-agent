import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ToolDefinition, Provider, AgentSession, AgentLoop, SDKEvent } from "../index.js";

/**
 * parallelDelegateTool
 * Spawns multiple specialized sub-agents in parallel to perform independent sub-tasks.
 */
export function parallelDelegateTool(
    parentProvider: Provider,
    availableTools: Map<string, ToolDefinition>,
    parentSession?: AgentSession,
    options: {
        maxTurns?: number;
    } = {}
): ToolDefinition {
    return {
        name: "parallel_delegate",
        description: "Delegates multiple sub-tasks to specialized agents in parallel. Use this for complex multi-step tasks that can be broken down into independent parts (e.g., Code Review + Security Audit + Documentation).",
        parameters: z.object({
            agents: z.array(z.object({
                role: z.string().describe("The persona/role of this specific sub-agent (e.g., 'Git Expert')"),
                task: z.string().describe("The specific task for this sub-agent."),
                instructions: z.string().optional().describe("Additional constraints or context.")
            })).describe("A list of specialized agents to spawn in parallel.")
        }),
        execute: async ({ agents }) => {
            const agentResults = await Promise.all(agents.map(async (cfg: any) => {
                const subSession = new AgentSession();
                const subId = randomUUID().slice(0, 8);
                subSession.setSystemPrompt(`You are a specialized agent [${subId}] acting as a: ${cfg.role}.\nTask: ${cfg.task}\n${cfg.instructions || ""}`);

                const subLoop = new AgentLoop({
                    session: subSession,
                    provider: parentProvider,
                    tools: availableTools,
                    maxTurns: options.maxTurns || 10
                });

                try {
                    // Pipe events from this sub-agent to the parent session with a prefix
                    const query = subLoop.runStream(cfg.task);
                    let finalResult = "";

                    for await (const event of query) {
                        if (event.type === 'status' && parentSession) {
                            parentSession.eventBus.emit("status", {
                                message: `[Parallel Agent ${subId} - ${cfg.role}] ${event.message}`,
                                uuid: randomUUID()
                            });
                        }
                        if (event.type === 'result') {
                            finalResult = event.result;
                        }
                    }

                    return {
                        role: cfg.role,
                        id: subId,
                        success: true,
                        result: finalResult
                    };
                } catch (error: any) {
                    return {
                        role: cfg.role,
                        id: subId,
                        success: false,
                        result: error.message
                    };
                }
            }));

            let output = "=== Parallel Execution Results ===\n\n";
            for (const res of agentResults) {
                output += `--- Sub-Agent: ${res.role} (ID: ${res.id}) [${res.success ? 'SUCCESS' : 'FAILED'}] ---\n`;
                output += `${res.result}\n\n`;
            }

            return output;
        }
    };
}
