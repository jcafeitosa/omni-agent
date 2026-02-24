import { AgentLoop } from "../loops/agent-loop.js";
import { AgentManager } from "./agent-manager.js";

export interface TeamTask {
    id: string;
    query: string;
    agentName?: string;
    customDefinition?: {
        prompt: string;
        tools?: string[];
        disallowedTools?: string[];
        model?: string;
        maxTurns?: number;
        maxCostUsd?: number;
        skills?: string[];
    };
    dependsOn?: string[];
    background?: boolean;
    collaborationNote?: string;
}

export interface TeamPlan {
    tasks: TeamTask[];
    maxParallel?: number;
}

export interface TeamTaskResult {
    id: string;
    success: boolean;
    result: string;
    elapsedMs: number;
}

export type TaskStatus = "pending" | "running" | "background" | "completed" | "failed" | "cancelled";

export interface ManagedTask {
    id: string;
    status: TaskStatus;
    startedAt?: number;
    endedAt?: number;
    elapsedMs?: number;
    success?: boolean;
    result?: string;
    error?: string;
    task: TeamTask;
}

export interface TeamRunResult {
    completed: TeamTaskResult[];
    failed: TeamTaskResult[];
    sharedState: Record<string, string>;
}

export class AgentOrchestrator {
    private readonly manager: AgentManager;
    private readonly background = new Map<string, Promise<TeamTaskResult>>();
    private readonly tasks = new Map<string, ManagedTask>();
    private readonly cancellations = new Set<string>();
    private readonly sharedState = new Map<string, string>();

    constructor(manager: AgentManager) {
        this.manager = manager;
    }

    public async runPlan(plan: TeamPlan): Promise<TeamRunResult> {
        for (const task of plan.tasks) {
            if (!this.tasks.has(task.id)) {
                this.tasks.set(task.id, {
                    id: task.id,
                    status: "pending",
                    task
                });
            }
        }

        const pending = new Map(plan.tasks.map((t) => [t.id, t]));
        const completed = new Map<string, TeamTaskResult>();
        const failed = new Map<string, TeamTaskResult>();
        const maxParallel = Math.max(1, plan.maxParallel ?? 3);

        while (pending.size > 0) {
            const ready = Array.from(pending.values()).filter((task) => {
                const deps = task.dependsOn || [];
                return deps.every((d) => completed.has(d));
            });

            if (ready.length === 0) {
                throw new Error("Team plan has unresolved dependencies or circular references.");
            }

            const batch = ready.slice(0, maxParallel);
            const outcomes = await Promise.all(batch.map((task) => this.executeTask(task)));

            for (const outcome of outcomes) {
                pending.delete(outcome.id);
                if (outcome.success) {
                    completed.set(outcome.id, outcome);
                } else {
                    failed.set(outcome.id, outcome);
                }
            }
        }

        return {
            completed: Array.from(completed.values()),
            failed: Array.from(failed.values()),
            sharedState: Object.fromEntries(this.sharedState.entries())
        };
    }

    public startTask(task: TeamTask): Promise<TeamTaskResult> {
        const record: ManagedTask = {
            id: task.id,
            status: task.background ? "background" : "pending",
            task
        };
        this.tasks.set(task.id, record);
        return this.executeTask(task);
    }

    public getTask(taskId: string): ManagedTask | undefined {
        return this.tasks.get(taskId);
    }

    public listTasks(): ManagedTask[] {
        return Array.from(this.tasks.values()).sort((a, b) => {
            const aTime = a.startedAt || 0;
            const bTime = b.startedAt || 0;
            return bTime - aTime;
        });
    }

    public setSharedState(key: string, value: string): void {
        this.sharedState.set(key, value);
    }

    public getSharedState(key: string): string | undefined {
        return this.sharedState.get(key);
    }

    public listSharedState(): Record<string, string> {
        return Object.fromEntries(this.sharedState.entries());
    }

    public cancelTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
            return false;
        }
        this.cancellations.add(taskId);
        task.status = "cancelled";
        task.endedAt = Date.now();
        task.elapsedMs = task.startedAt ? task.endedAt - task.startedAt : 0;
        task.success = false;
        task.error = "Cancelled by user";
        this.tasks.set(taskId, task);
        return true;
    }

    public waitForBackground(taskId: string): Promise<TeamTaskResult> | undefined {
        return this.background.get(taskId);
    }

    private async executeTask(task: TeamTask): Promise<TeamTaskResult> {
        const started = Date.now();
        this.tasks.set(task.id, {
            id: task.id,
            status: task.background ? "background" : "running",
            startedAt: started,
            task
        });

        const run = async () => {
            if (this.cancellations.has(task.id)) {
                return this.finalizeCancelled(task.id, started);
            }
            try {
                const agent = this.createTaskAgent(task);
                const queryWithContext = this.buildCollaborativeQuery(task);
                const result = await agent.run(queryWithContext);
                if (this.cancellations.has(task.id)) {
                    return this.finalizeCancelled(task.id, started);
                }
                const elapsedMs = Date.now() - started;
                this.tasks.set(task.id, {
                    id: task.id,
                    status: "completed",
                    startedAt: started,
                    endedAt: Date.now(),
                    elapsedMs,
                    success: true,
                    result,
                    task
                });
                this.sharedState.set(task.id, result);
                return {
                    id: task.id,
                    success: true,
                    result,
                    elapsedMs
                };
            } catch (error: any) {
                const elapsedMs = Date.now() - started;
                this.tasks.set(task.id, {
                    id: task.id,
                    status: "failed",
                    startedAt: started,
                    endedAt: Date.now(),
                    elapsedMs,
                    success: false,
                    error: error?.message || String(error),
                    result: error?.message || String(error),
                    task
                });
                return {
                    id: task.id,
                    success: false,
                    result: error?.message || String(error),
                    elapsedMs
                };
            }
        };

        if (task.background) {
            const promise = run();
            this.background.set(task.id, promise);
            promise.finally(() => this.background.delete(task.id)).catch(() => undefined);
            return {
                id: task.id,
                success: true,
                result: `Task ${task.id} started in background.`,
                elapsedMs: Date.now() - started
            };
        }

        return run();
    }

    private finalizeCancelled(taskId: string, startedAt: number): TeamTaskResult {
        const endedAt = Date.now();
        const elapsedMs = endedAt - startedAt;
        const previous = this.tasks.get(taskId);
        this.tasks.set(taskId, {
            id: taskId,
            status: "cancelled",
            startedAt,
            endedAt,
            elapsedMs,
            success: false,
            error: "Cancelled by user",
            result: previous?.result || "Cancelled by user",
            task: previous?.task || { id: taskId, query: "" }
        });
        return {
            id: taskId,
            success: false,
            result: "Cancelled by user",
            elapsedMs
        };
    }

    private createTaskAgent(task: TeamTask): AgentLoop {
        if (task.customDefinition) {
            return this.manager.createAgent(task.customDefinition as any);
        }
        if (task.agentName) {
            return this.manager.createAgent(task.agentName);
        }
        return this.manager.createAgent({
            description: "Default teammate agent",
            prompt: "You are a specialized teammate agent.",
            maxTurns: 10
        });
    }

    private buildCollaborativeQuery(task: TeamTask): string {
        const deps = task.dependsOn || [];
        if (deps.length === 0 && !task.collaborationNote) {
            return task.query;
        }

        const depContext = deps
            .map((depId) => {
                const value = this.sharedState.get(depId);
                if (!value) return null;
                return `Dependency ${depId} output:\n${value}`;
            })
            .filter((v): v is string => Boolean(v))
            .join("\n\n");

        const note = task.collaborationNote ? `Collaboration note:\n${task.collaborationNote}` : "";
        const sections = [note, depContext, `Task:\n${task.query}`].filter(Boolean);
        return sections.join("\n\n");
    }
}
