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
            action: z.enum(["run", "plan", "start", "status", "list", "cancel", "wait"]).optional().default("run"),
            query: z.string().optional().describe("The task or query for the subagent"),
            taskId: z.string().optional().describe("Task identifier for start/status/cancel/wait actions"),
            agentName: z.string().optional().describe("Name of a pre-defined agent to use"),
            customDefinition: z.object({
                prompt: z.string().describe("System prompt for the custom subagent"),
                tools: z.array(z.string()).optional().describe("List of tools to allow"),
                disallowedTools: z.array(z.string()).optional().describe("List of tools to explicitly disallow"),
                model: z.string().optional().describe("Model override for the subagent"),
            }).optional()
            ,
            teamPlan: z.object({
                maxParallel: z.number().int().positive().optional(),
                tasks: z.array(z.object({
                    id: z.string(),
                    query: z.string(),
                    agentName: z.string().optional(),
                    dependsOn: z.array(z.string()).optional(),
                    background: z.boolean().optional(),
                    collaborationNote: z.string().optional()
                }))
            }).optional().describe("Optional multi-agent plan with dependency orchestration")
        }),
        execute: async ({ action = "run", query, taskId, agentName, customDefinition, teamPlan }) => {
            const resolvedQuery = query || "";
            const orchestrator = agentManager.createOrchestrator();

            if (action === "list") {
                return JSON.stringify(orchestrator.listTasks(), null, 2);
            }
            if (action === "status") {
                if (!taskId) throw new Error("taskId is required for action=status");
                return JSON.stringify(orchestrator.getTask(taskId) || null, null, 2);
            }
            if (action === "cancel") {
                if (!taskId) throw new Error("taskId is required for action=cancel");
                return JSON.stringify({ taskId, cancelled: orchestrator.cancelTask(taskId) }, null, 2);
            }
            if (action === "wait") {
                if (!taskId) throw new Error("taskId is required for action=wait");
                const promise = orchestrator.waitForBackground(taskId);
                if (!promise) return JSON.stringify({ taskId, status: "not_found_or_not_background" }, null, 2);
                const result = await promise;
                return JSON.stringify(result, null, 2);
            }

            if (teamPlan || action === "plan") {
                if (!teamPlan) throw new Error("teamPlan is required for action=plan");
                const orchestrator = agentManager.createOrchestrator();
                const result = await orchestrator.runPlan({
                    maxParallel: teamPlan.maxParallel,
                    tasks: teamPlan.tasks
                });
                return JSON.stringify(result, null, 2);
            }

            if (action === "start") {
                if (!taskId) throw new Error("taskId is required for action=start");
                const task = {
                    id: taskId,
                    query: resolvedQuery,
                    agentName,
                    customDefinition,
                    background: true
                };
                const started = await orchestrator.startTask(task);
                return JSON.stringify(started, null, 2);
            }

            if (!agentName && !customDefinition) {
                throw new Error("Either agentName or customDefinition must be provided to spawn a subagent.");
            }

            const definition = agentName || customDefinition;

            // Note: In a production scenario, we'd want to pass the current loop's tools
            // to allow deep inheritance.
            const subAgent = agentManager.createAgent(definition as any);

            // Run the subagent and return its final result
            const result = await subAgent.run(resolvedQuery);
            return result;
        }
    };
}
