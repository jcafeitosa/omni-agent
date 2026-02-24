import { spawn } from "node:child_process";
import { AgentLoop } from "../loops/agent-loop.js";
import { AgentManager } from "./agent-manager.js";
import { AgentCommunicationHub, CommunicationRole, CommunicationChannel, ChannelType } from "./agent-communication.js";

export interface TeamTask {
    id: string;
    query: string;
    agentName?: string;
    customDefinition?: {
        description?: string;
        prompt: string;
        tools?: string[];
        disallowedTools?: string[];
        model?: string;
        maxTurns?: number;
        maxCostUsd?: number;
        skills?: string[];
        isolation?: "none" | "worktree";
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
        allowedAgents?: string[];
        memory?: "user" | "project" | "local";
    };
    dependsOn?: string[];
    background?: boolean;
    collaborationNote?: string;
    externalCommand?: string;
    workingDirectory?: string;
    toolUseId?: string;
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

export interface OrchestratorCommunicationPolicy {
    hub: AgentCommunicationHub;
    workspaceId: string;
    mainChannelId: string;
    orchestratorId: string;
    requireMainChannelUpdates?: boolean;
}

export interface OrchestratedTeam {
    id: string;
    workspaceId: string;
    mainChannelId: string;
    teamChannelId: string;
    participants: string[];
    temporary: boolean;
    createdAt: number;
}

export interface CreateTeamInput {
    id: string;
    participants: string[];
    channelName?: string;
    channelType?: Extract<ChannelType, "private" | "project" | "team">;
    temporary?: boolean;
}

export interface OrchestratorCreateChannelInput {
    name: string;
    type: ChannelType;
    isPrivate?: boolean;
    team?: string;
    department?: string;
    participants?: string[];
}

export class AgentOrchestrator {
    private readonly manager: AgentManager;
    private readonly background = new Map<string, Promise<TeamTaskResult>>();
    private readonly tasks = new Map<string, ManagedTask>();
    private readonly cancellations = new Set<string>();
    private readonly sharedState = new Map<string, string>();
    private communication?: OrchestratorCommunicationPolicy;
    private readonly teams = new Map<string, OrchestratedTeam>();

    constructor(manager: AgentManager) {
        this.manager = manager;
    }

    public configureCommunication(policy: OrchestratorCommunicationPolicy): void {
        this.communication = {
            ...policy,
            requireMainChannelUpdates: policy.requireMainChannelUpdates !== false
        };
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

    public createCommunicationChannel(input: OrchestratorCreateChannelInput): CommunicationChannel {
        const policy = this.requireCommunicationPolicy();
        this.ensureAgentReady(policy, policy.orchestratorId);
        const channel = policy.hub.createChannel({
            workspaceId: policy.workspaceId,
            name: input.name,
            type: input.type,
            createdBy: policy.orchestratorId,
            isPrivate: input.isPrivate,
            team: input.team,
            department: input.department
        });
        for (const participant of input.participants || []) {
            this.ensureAgentReady(policy, participant);
            policy.hub.addChannelMember(policy.workspaceId, channel.id, participant, policy.orchestratorId);
        }
        return channel;
    }

    public updateCommunicationChannel(
        channelId: string,
        patch: { name?: string; isPrivate?: boolean; team?: string; department?: string }
    ): CommunicationChannel {
        const policy = this.requireCommunicationPolicy();
        return policy.hub.updateChannel({
            workspaceId: policy.workspaceId,
            channelId,
            requestedBy: policy.orchestratorId,
            ...patch
        });
    }

    public deleteCommunicationChannel(channelId: string): void {
        const policy = this.requireCommunicationPolicy();
        policy.hub.deleteChannel(policy.workspaceId, channelId, policy.orchestratorId);
        for (const [teamId, team] of this.teams.entries()) {
            if (team.teamChannelId === channelId) this.teams.delete(teamId);
        }
    }

    public createTeam(input: CreateTeamInput): OrchestratedTeam {
        const policy = this.requireCommunicationPolicy();
        if (this.teams.has(input.id)) {
            throw new Error(`Team already exists: ${input.id}`);
        }
        const participants = Array.from(new Set(input.participants.map((value) => value.trim()).filter(Boolean)));
        if (participants.length === 0) {
            throw new Error("Team must have at least one participant.");
        }
        const teamChannel = this.createCommunicationChannel({
            name: input.channelName || `team-${input.id}`,
            type: input.channelType || "private",
            isPrivate: true,
            team: input.id,
            participants
        });
        for (const participant of participants) {
            this.ensureAgentReady(policy, participant);
        }
        const team: OrchestratedTeam = {
            id: input.id,
            workspaceId: policy.workspaceId,
            mainChannelId: policy.mainChannelId,
            teamChannelId: teamChannel.id,
            participants,
            temporary: input.temporary !== false,
            createdAt: Date.now()
        };
        this.teams.set(input.id, team);
        policy.hub.postMessage({
            workspaceId: policy.workspaceId,
            channelId: policy.mainChannelId,
            senderId: policy.orchestratorId,
            text: `[team_created] time ${input.id} criado. canal temporario: ${team.teamChannelId}. participantes: ${participants.join(", ")}`
        });
        return team;
    }

    public disbandTeam(teamId: string): void {
        const policy = this.requireCommunicationPolicy();
        const team = this.teams.get(teamId);
        if (!team) throw new Error(`Unknown team: ${teamId}`);
        policy.hub.deleteChannel(policy.workspaceId, team.teamChannelId, policy.orchestratorId);
        this.teams.delete(teamId);
        policy.hub.postMessage({
            workspaceId: policy.workspaceId,
            channelId: policy.mainChannelId,
            senderId: policy.orchestratorId,
            text: `[team_disbanded] time ${teamId} encerrado e canal ${team.teamChannelId} removido.`
        });
    }

    public listTeams(): OrchestratedTeam[] {
        return Array.from(this.teams.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    private async executeTask(task: TeamTask): Promise<TeamTaskResult> {
        const started = Date.now();
        await this.postTaskUpdate(task, "task_started", {});
        this.tasks.set(task.id, {
            id: task.id,
            status: task.background ? "background" : "running",
            startedAt: started,
            task
        });

        const run = async () => {
            if (this.cancellations.has(task.id)) {
                return await this.finalizeCancelled(task.id, started);
            }
            await this.emitHook("SubagentStart", {
                task_id: task.id,
                tool_use_id: task.toolUseId,
                agent_name: task.agentName,
                query: task.query,
                background: Boolean(task.background)
            });
            try {
                const agent = this.createTaskAgent(task);
                const queryWithContext = this.buildCollaborativeQuery(task);
                const result = task.externalCommand
                    ? await this.runExternalTask(task, queryWithContext)
                    : await agent.run(queryWithContext);
                if (this.cancellations.has(task.id)) {
                    return await this.finalizeCancelled(task.id, started);
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
                await this.emitHook("TaskCompleted", {
                    task_id: task.id,
                    tool_use_id: task.toolUseId,
                    agent_name: task.agentName,
                    success: true,
                    elapsed_ms: elapsedMs,
                    result
                });
                await this.emitHook("SubagentStop", {
                    task_id: task.id,
                    tool_use_id: task.toolUseId,
                    agent_name: task.agentName,
                    success: true,
                    elapsed_ms: elapsedMs,
                    last_assistant_message: result
                });
                await this.emitHook("TeammateIdle", {
                    task_id: task.id,
                    tool_use_id: task.toolUseId,
                    agent_name: task.agentName,
                    idle: true
                });
                await this.postTaskUpdate(task, "task_completed", { elapsedMs, result });
                return {
                    id: task.id,
                    success: true,
                    result,
                    elapsedMs
                };
            } catch (error: any) {
                const elapsedMs = Date.now() - started;
                const message = error?.message || String(error);
                this.tasks.set(task.id, {
                    id: task.id,
                    status: "failed",
                    startedAt: started,
                    endedAt: Date.now(),
                    elapsedMs,
                    success: false,
                    error: message,
                    result: message,
                    task
                });
                await this.emitHook("TaskCompleted", {
                    task_id: task.id,
                    tool_use_id: task.toolUseId,
                    agent_name: task.agentName,
                    success: false,
                    elapsed_ms: elapsedMs,
                    error: message
                });
                await this.emitHook("SubagentStop", {
                    task_id: task.id,
                    tool_use_id: task.toolUseId,
                    agent_name: task.agentName,
                    success: false,
                    elapsed_ms: elapsedMs,
                    error: message
                });
                await this.postTaskUpdate(task, "task_failed", { elapsedMs, error: message });
                return {
                    id: task.id,
                    success: false,
                    result: message,
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

    private async finalizeCancelled(taskId: string, startedAt: number): Promise<TeamTaskResult> {
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
        void this.emitHook("TaskCompleted", {
            task_id: taskId,
            tool_use_id: previous?.task?.toolUseId,
            success: false,
            elapsed_ms: elapsedMs,
            error: "Cancelled by user"
        });
        void this.emitHook("SubagentStop", {
            task_id: taskId,
            tool_use_id: previous?.task?.toolUseId,
            success: false,
            elapsed_ms: elapsedMs,
            error: "Cancelled by user"
        });
        await this.postTaskUpdate(previous?.task || { id: taskId, query: "" }, "task_cancelled", { elapsedMs });
        return {
            id: taskId,
            success: false,
            result: "Cancelled by user",
            elapsedMs
        };
    }

    private createTaskAgent(task: TeamTask): AgentLoop {
        const isolation = task.customDefinition?.isolation || this.manager.getDefinition(task.agentName || "")?.manifest.isolation;
        if (isolation === "worktree") {
            return this.createWorktreeIsolatedTaskAgent(task);
        }
        if (task.customDefinition) {
            return this.manager.createAgent(task.customDefinition as any, {
                workingDirectory: task.workingDirectory
            });
        }
        if (task.agentName) {
            return this.manager.createAgent(task.agentName, {
                workingDirectory: task.workingDirectory
            });
        }
        return this.manager.createAgent({
            description: "Default teammate agent",
            prompt: "You are a specialized teammate agent.",
            maxTurns: 10
        }, {
            workingDirectory: task.workingDirectory
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

    private async emitHook(eventName: string, payload: Record<string, unknown>): Promise<void> {
        const hookManager = this.manager.getHookManager?.();
        if (!hookManager) return;
        try {
            await hookManager.emit(eventName, payload);
        } catch {
            // hooks are non-blocking for task orchestration
        }
    }

    private createWorktreeIsolatedTaskAgent(task: TeamTask): AgentLoop {
        const throwUninitialized = () => {
            throw new Error("Worktree-isolated agent requested before runtime initialization.");
        };
        const lazy = {
            run: async (query: string) => {
                const worktree = await this.manager.getWorktreeManager().create(task.id);
                await this.emitHook("WorktreeCreate", {
                    task_id: task.id,
                    worktree_path: worktree.path
                });
                try {
                    const loop = task.customDefinition
                        ? this.manager.createAgent(task.customDefinition as any, { workingDirectory: worktree.path })
                        : task.agentName
                            ? this.manager.createAgent(task.agentName, { workingDirectory: worktree.path })
                            : this.manager.createAgent({
                                description: "Worktree teammate",
                                prompt: "You are a specialized teammate agent.",
                                maxTurns: 10
                            }, { workingDirectory: worktree.path });
                    return await loop.run(query);
                } finally {
                    await this.manager.getWorktreeManager().remove(worktree.path);
                    await this.emitHook("WorktreeRemove", {
                        task_id: task.id,
                        worktree_path: worktree.path
                    });
                }
            }
        };
        return {
            run: lazy.run,
            runStream: throwUninitialized as any,
            initialize: async () => undefined
        } as unknown as AgentLoop;
    }

    private runExternalTask(task: TeamTask, queryWithContext: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn(task.externalCommand!, {
                shell: true,
                cwd: task.workingDirectory || process.cwd(),
                env: {
                    ...process.env,
                    OMNI_AGENT_TASK_ID: task.id,
                    OMNI_AGENT_TOOL_USE_ID: task.toolUseId || "",
                    OMNI_AGENT_TASK_QUERY: queryWithContext
                }
            });
            let stdout = "";
            let stderr = "";
            child.stdout?.on("data", (d) => (stdout += d.toString()));
            child.stderr?.on("data", (d) => (stderr += d.toString()));
            child.on("error", reject);
            child.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout.trim() || `External task ${task.id} completed.`);
                } else {
                    reject(new Error(stderr.trim() || `External task failed with code ${code}`));
                }
            });
        });
    }

    private resolveTaskAgentId(task: TeamTask): string {
        const raw = (task.agentName || `agent-${task.id}`).trim();
        return raw.replace(/[^a-zA-Z0-9:_-]/g, "-");
    }

    private async postTaskUpdate(
        task: TeamTask,
        subtype: "task_started" | "task_completed" | "task_failed" | "task_cancelled",
        options: {
            elapsedMs?: number;
            result?: string;
            error?: string;
        }
    ): Promise<void> {
        this.assertCommunicationPolicy();
        const policy = this.communication!;
        const senderId = this.resolveTaskAgentId(task);
        this.ensureMainChannelExists(policy);
        this.ensureAgentReady(policy, senderId);
        const text = this.formatSlackStyleUpdate(task, subtype, senderId, options);

        policy.hub.postMessage({
            workspaceId: policy.workspaceId,
            channelId: policy.mainChannelId,
            senderId,
            text,
            metadata: {
                subtype,
                taskId: task.id,
                orchestratorId: policy.orchestratorId,
                agentId: senderId
            }
        });
    }

    private assertCommunicationPolicy(): void {
        this.requireCommunicationPolicy();
    }

    private requireCommunicationPolicy(): OrchestratorCommunicationPolicy {
        if (!this.communication) {
            throw new Error(
                "Mandatory communication policy not configured. Call configureCommunication() with workspace/main channel."
            );
        }
        return this.communication;
    }

    private ensureMainChannelExists(policy: OrchestratorCommunicationPolicy): void {
        const channel = policy.hub.listChannels(policy.workspaceId).find((item) => item.id === policy.mainChannelId);
        if (!channel) {
            throw new Error(`Main channel not found: ${policy.mainChannelId}`);
        }
    }

    private ensureAgentReady(policy: OrchestratorCommunicationPolicy, agentId: string): void {
        try {
            policy.hub.listChannelsForAgent(policy.workspaceId, agentId);
        } catch {
            policy.hub.registerAgent(policy.workspaceId, {
                id: agentId,
                displayName: agentId,
                role: "agent" as CommunicationRole
            });
        }
        policy.hub.joinChannel(policy.workspaceId, policy.mainChannelId, agentId);
    }

    private formatSlackStyleUpdate(
        task: TeamTask,
        subtype: "task_started" | "task_completed" | "task_failed" | "task_cancelled",
        senderId: string,
        options: { elapsedMs?: number; result?: string; error?: string }
    ): string {
        const queryPreview = task.query?.trim() ? truncate(task.query.trim(), 140) : "sem query detalhada";
        if (subtype === "task_started") {
            return `[task_started] pessoal, ${senderId} pegou a task ${task.id}. foco agora: ${queryPreview}`;
        }
        if (subtype === "task_completed") {
            const elapsed = options.elapsedMs !== undefined ? `${options.elapsedMs}ms` : "n/a";
            const summary = options.result ? truncate(options.result.replace(/\s+/g, " "), 180) : "sem resumo";
            return `[task_completed] update rapido: ${senderId} fechou ${task.id} em ${elapsed}. resultado: ${summary}`;
        }
        if (subtype === "task_failed") {
            const elapsed = options.elapsedMs !== undefined ? `${options.elapsedMs}ms` : "n/a";
            const error = options.error ? truncate(options.error, 180) : "erro nao informado";
            return `[task_failed] alerta tecnico: ${senderId} falhou em ${task.id} (${elapsed}). erro: ${error}`;
        }
        const elapsed = options.elapsedMs !== undefined ? `${options.elapsedMs}ms` : "n/a";
        return `[task_cancelled] ${senderId} cancelou ${task.id}. tempo gasto: ${elapsed}`;
    }
}

function truncate(value: string, max = 160): string {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 3))}...`;
}
