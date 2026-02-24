import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ToolDefinition, Provider, AgentSession, AgentLoop } from "../index.js";

/**
 * delegateTool
 * Creates a tool that allows an agent to delegate a sub-task to a specialized agent.
 */
export function delegateTool(
    parentProvider: Provider,
    availableTools: Map<string, ToolDefinition>,
    parentSession?: AgentSession,
    options: {
        maxTurns?: number;
    } = {}
): ToolDefinition {
    return {
        name: "delegate",
        description: "Delegates a specific sub-task to a specialized agent with a defined role. Use this for complex multi-step tasks that benefit from isolation.",
        parameters: z.object({
            role: z.string().describe("The persona/role of the sub-agent (e.g., 'Git Expert', 'Security Auditor')"),
            task: z.string().describe("The specific task the sub-agent should perform."),
            instructions: z.string().optional().describe("Additional constraints or context for the sub-agent.")
        }),
        execute: async ({ role, task, instructions }) => {
            // Create a fresh session for the sub-agent to ensure isolation
            const subSession = new AgentSession();
            subSession.setSystemPrompt(`You are a specialized agent acting as a: ${role}.\nTask: ${task}\n${instructions || ""}`);

            // Instantiate a sub-loop
            const subLoop = new AgentLoop({
                session: subSession,
                provider: parentProvider,
                tools: availableTools,
                maxTurns: options.maxTurns || 10
            });

            try {
                // Run the sub-loop and pipe events if parent session exists
                const query = subLoop.runStream(task);
                let finalResult = "";

                for await (const event of query) {
                    if (event.type === 'status' && parentSession) {
                        parentSession.eventBus.emit("status", {
                            message: `[${role}] ${event.message}`,
                            uuid: randomUUID()
                        });
                    }
                    if (event.type === 'text') {
                        // We could stream text too, but usually we just want the final result
                    }
                    if (event.type === 'result') {
                        finalResult = event.result;
                    }
                }

                return `--- Sub-Agent (${role}) Result ---\n${finalResult}`;
            } catch (error: any) {
                return `Error in Sub-Agent (${role}): ${error.message}`;
            }
        }
    };
}
