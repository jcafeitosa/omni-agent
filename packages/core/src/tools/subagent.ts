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
                    collaborationNote: z.string().optional(),
                    externalCommand: z.string().optional(),
                    workingDirectory: z.string().optional()
                }))
            }).optional().describe("Optional multi-agent plan with dependency orchestration")
        }),
        execute: async ({ action = "run", query, taskId, agentName, customDefinition, teamPlan }, context: any) => {
            const resolvedQuery = query || "";
            const orchestrator = agentManager.createOrchestrator();
            const parentAgentName = context?.loop?.getAgentName?.();
            const toolUseId = context?.toolUseId ? String(context.toolUseId) : undefined;
            const emitTaskNotification = (payload: {
                subtype: "task_started" | "task_completed" | "task_failed" | "task_cancelled";
                task_id: string;
                agent_name?: string;
                message?: string;
            }) => {
                context?.loop?.emitTaskNotification?.({
                    ...payload,
                    tool_use_id: toolUseId
                });
            };

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
                emitTaskNotification({
                    subtype: result.success ? "task_completed" : "task_failed",
                    task_id: taskId,
                    agent_name: orchestrator.getTask(taskId)?.task.agentName,
                    message: result.result
                });
                return JSON.stringify(result, null, 2);
            }

            if (teamPlan || action === "plan") {
                if (!teamPlan) throw new Error("teamPlan is required for action=plan");
                for (const plannedTask of teamPlan.tasks) {
                    emitTaskNotification({
                        subtype: "task_started",
                        task_id: plannedTask.id,
                        agent_name: plannedTask.agentName,
                        message: "Task registered from plan."
                    });
                }
                const orchestrator = agentManager.createOrchestrator();
                const result = await orchestrator.runPlan({
                    maxParallel: teamPlan.maxParallel,
                    tasks: teamPlan.tasks.map((t: any) => ({ ...t, toolUseId }))
                });
                for (const done of result.completed) {
                    emitTaskNotification({
                        subtype: "task_completed",
                        task_id: done.id,
                        agent_name: orchestrator.getTask(done.id)?.task.agentName,
                        message: done.result
                    });
                }
                for (const fail of result.failed) {
                    emitTaskNotification({
                        subtype: "task_failed",
                        task_id: fail.id,
                        agent_name: orchestrator.getTask(fail.id)?.task.agentName,
                        message: fail.result
                    });
                }
                return JSON.stringify(result, null, 2);
            }

            if (action === "start") {
                if (!taskId) throw new Error("taskId is required for action=start");
                if (agentName && !agentManager.canSpawnSubagent(parentAgentName, agentName)) {
                    throw new Error(`Agent '${parentAgentName}' is not allowed to spawn '${agentName}'.`);
                }
                const task = {
                    id: taskId,
                    query: resolvedQuery,
                    agentName,
                    customDefinition,
                    background: true,
                    workingDirectory: context?.workingDirectory,
                    toolUseId
                };
                emitTaskNotification({
                    subtype: "task_started",
                    task_id: task.id,
                    agent_name: task.agentName,
                    message: "Background task started."
                });
                const started = await orchestrator.startTask(task);
                return JSON.stringify(started, null, 2);
            }

            if (!agentName && !customDefinition) {
                throw new Error("Either agentName or customDefinition must be provided to spawn a subagent.");
            }

            if (agentName && !agentManager.canSpawnSubagent(parentAgentName, agentName)) {
                throw new Error(`Agent '${parentAgentName}' is not allowed to spawn '${agentName}'.`);
            }

            const definition = agentName || customDefinition;
            const directTaskId = taskId || `run-${Date.now()}`;
            emitTaskNotification({
                subtype: "task_started",
                task_id: directTaskId,
                agent_name: typeof definition === "string" ? definition : "custom-subagent",
                message: "Direct subagent execution started."
            });

            // Note: In a production scenario, we'd want to pass the current loop's tools
            // to allow deep inheritance.
            const subAgent = agentManager.createAgent(definition as any);

            try {
                // Run the subagent and return its final result
                const result = await subAgent.run(resolvedQuery);
                emitTaskNotification({
                    subtype: "task_completed",
                    task_id: directTaskId,
                    agent_name: typeof definition === "string" ? definition : "custom-subagent",
                    message: result
                });
                return result;
            } catch (error: any) {
                emitTaskNotification({
                    subtype: "task_failed",
                    task_id: directTaskId,
                    agent_name: typeof definition === "string" ? definition : "custom-subagent",
                    message: error?.message || String(error)
                });
                throw error;
            }
        }
    };
}
