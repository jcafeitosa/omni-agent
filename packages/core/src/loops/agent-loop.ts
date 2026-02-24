import { AgentSession } from "../state/session.js";
import { AgentMessage, ToolCall, SDKEvent, SDKError } from "../types/messages.js";
import { ToolDefinition, Provider, Sandbox } from "../index.js";
import { HookManager } from "../state/hook-manager.js";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { PermissionManager, PermissionMode } from "../state/permissions.js";
import { PolicyEngine } from "../state/policy-engine.js";
import { CommandRegistry } from "../commands/command-registry.js";
import { HelpCommand } from "../commands/help-command.js";
import { CostCommand } from "../commands/cost-command.js";
import { CompactCommand } from "../commands/compact-command.js";
import { CommitCommand } from "../commands/commit-command.js";
import { ClearCommand } from "../commands/clear-command.js";
import { IndexCommand } from "../commands/index-command.js";
import { ContextLoader } from "../state/context-loader.js";
import { VectorStore, InMemoryVectorStore } from "../state/vector-store.js";
import { PersistentVectorStore } from "../state/persistent-vector-store.js";
import { semanticSearchTool } from "../tools/semantic-search.js";
import { delegateTool } from "../tools/delegate.js";
import { parallelDelegateTool } from "../tools/parallel-delegate.js";
import type { AgentManager } from "../state/agent-manager.js";
import { AgentsCommand } from "../commands/agents-command.js";
import { SkillsCommand } from "../commands/skills-command.js";
import { SecurityReviewCommand } from "../commands/security-review-command.js";
import { z } from "zod";
import { parseStructuredResult } from "../helpers/structured-result.js";
import { EventLogStore } from "../state/event-log-store.js";
import { OTelLiteManager } from "../events/otel-lite.js";
import { parsePlanUpdatePayload, parseRequestUserInputPayload } from "../events/protocol-events.js";
import type { SkillDefinition } from "../state/skill-manager.js";

interface AgentLoopOptions {
    session: AgentSession;
    provider: Provider;
    tools: Map<string, ToolDefinition>;
    hookManager?: HookManager;
    permissionManager?: PermissionManager;
    sandbox?: Sandbox;
    maxTurns?: number;
    maxCostUsd?: number;
    agentName?: string;
    policyEngine?: PolicyEngine;
    agentManager?: AgentManager;
    workingDirectory?: string;
    compactionControl?: {
        enabled: boolean;
        contextTokenThreshold?: number;
        targetRatio?: number;
        summaryPrefix?: string;
    };
    structuredOutput?: {
        schema?: z.ZodTypeAny;
        strict?: boolean;
        failOnValidationError?: boolean;
    };
    toolRunnerMode?: "standard" | "provider_native";
    eventLogStore?: EventLogStore;
    otelManager?: OTelLiteManager;
    activatedSkills?: SkillDefinition[];
}

/**
 * High-level interface to an agentic query, aligned with Claude SDK.
 */
export interface Query extends AsyncGenerator<SDKEvent, void, unknown> {
    interrupt(): void;
    close(): void;
    promptSuggestion(): Promise<string[]>;
    setPermissionMode(mode: PermissionMode): void;
}

/**
 * State Machine for the OmniAgent loop.
 * Refactored to align with official Claude Agent SDK patterns.
 */
export class AgentLoop {
    private session: AgentSession;
    private provider: Provider;
    private tools: Map<string, ToolDefinition>;
    private hookManager?: HookManager;
    private permissionManager: PermissionManager;
    private commandRegistry: CommandRegistry;
    private contextLoader: ContextLoader;
    private vectorStore: VectorStore;
    private sandbox?: Sandbox;
    private maxTurns: number;
    private maxCostUsd?: number;
    private agentName?: string;
    private policyEngine?: PolicyEngine;
    public readonly agentManager?: AgentManager;
    private readonly workingDirectory: string;
    private isInterrupted = false;
    private configState = new Map<string, number>();
    private readonly compactionControl?: {
        enabled: boolean;
        contextTokenThreshold?: number;
        targetRatio?: number;
        summaryPrefix?: string;
    };
    private readonly structuredOutput?: {
        schema?: z.ZodTypeAny;
        strict?: boolean;
        failOnValidationError?: boolean;
    };
    private readonly toolRunnerMode: "standard" | "provider_native";
    private readonly eventLogStore?: EventLogStore;
    private readonly otelManager?: OTelLiteManager;
    private readonly activatedSkills: SkillDefinition[];

    constructor(options: AgentLoopOptions) {
        this.session = options.session;
        this.provider = options.provider;
        this.tools = options.tools;
        this.hookManager = options.hookManager;
        this.permissionManager = options.permissionManager || new PermissionManager();
        this.sandbox = options.sandbox;
        this.vectorStore = new PersistentVectorStore();
        this.maxTurns = options.maxTurns || 15;
        this.maxCostUsd = options.maxCostUsd;
        this.agentName = options.agentName;
        this.policyEngine = options.policyEngine;
        this.agentManager = options.agentManager;
        this.workingDirectory = options.workingDirectory || process.cwd();
        this.compactionControl = options.compactionControl;
        this.structuredOutput = options.structuredOutput;
        this.toolRunnerMode = options.toolRunnerMode || "standard";
        this.eventLogStore = options.eventLogStore;
        this.otelManager = options.otelManager;
        this.activatedSkills = options.activatedSkills || [];

        if (this.policyEngine && !options.permissionManager) {
            this.permissionManager.setPolicyEngine(this.policyEngine);
        }

        // Register default semantic search tool if indexed
        if (!this.tools.has("semantic_search")) {
            this.tools.set("semantic_search", semanticSearchTool(this.provider, this.vectorStore));
        }

        if (!this.tools.has("delegate")) {
            this.tools.set("delegate", delegateTool(this.provider, this.tools, this.session));
        }
        if (!this.tools.has("parallel_delegate")) {
            this.tools.set("parallel_delegate", parallelDelegateTool(this.provider, this.tools, this.session));
        }

        this.commandRegistry = new CommandRegistry();
        this.commandRegistry.register(new HelpCommand());
        this.commandRegistry.register(new CostCommand());
        this.commandRegistry.register(new CompactCommand());
        this.commandRegistry.register(new CommitCommand());
        this.commandRegistry.register(new IndexCommand());
        this.commandRegistry.register(new ClearCommand());
        this.commandRegistry.register(new AgentsCommand());
        this.commandRegistry.register(new SkillsCommand());
        this.commandRegistry.register(new SecurityReviewCommand());

        this.contextLoader = new ContextLoader();

        // Load project constitution if available
        const constitution = this.contextLoader.loadConstitution(this.workingDirectory);
        if (constitution) {
            const currentPrompt = this.session.getSystemPrompt();
            this.session.setSystemPrompt(`${currentPrompt}\n\nProject Constitution (CLAUDE.md):\n${constitution}`);
        }
        const bootstrap = this.contextLoader.loadBootstrapContext(this.workingDirectory);
        if (bootstrap) {
            const currentPrompt = this.session.getSystemPrompt();
            this.session.setSystemPrompt(`${currentPrompt}\n\nWorkspace Bootstrap Context:\n${bootstrap}`);
        }
    }

    /**
     * Initializes the agent loop (e.g., loading persistent data).
     */
    async initialize(): Promise<void> {
        if (this.vectorStore instanceof PersistentVectorStore) {
            await this.vectorStore.load();
        }
    }

    public getAgentName(): string | undefined {
        return this.agentName;
    }

    public emitTaskNotification(notification: {
        subtype: "task_started" | "task_completed" | "task_failed" | "task_cancelled";
        task_id: string;
        tool_use_id?: string;
        agent_name?: string;
        message?: string;
    }): void {
        this.session.eventBus.emit("task_notification", notification);
    }

    public emitRequestUserInput(payload: {
        call_id: string;
        turn_id?: string;
        questions: Array<{
            id: string;
            header: string;
            question: string;
            isOther?: boolean;
            isSecret?: boolean;
            options?: Array<{ label: string; description: string }>;
        }>;
    }): void {
        const normalized = parseRequestUserInputPayload(payload);
        if (!normalized) {
            this.session.eventBus.emit("status", {
                message: "Invalid request_user_input payload ignored."
            });
            return;
        }
        this.session.eventBus.emit("request_user_input", normalized);
    }

    public emitPlanUpdate(payload: {
        explanation?: string;
        plan: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>;
    }): void {
        const normalized = parsePlanUpdatePayload(payload);
        if (!normalized) {
            this.session.eventBus.emit("status", {
                message: "Invalid plan_update payload ignored."
            });
            return;
        }
        this.session.eventBus.emit("plan_update", normalized);
    }

    public async promptSuggestion(): Promise<string[]> {
        return this.generatePromptSuggestions();
    }

    public compactNow(): { removedMessagesCount: number; newTokenCount: number } {
        const threshold = this.compactionControl?.contextTokenThreshold || 100_000;
        const result = this.session.compactHistory({
            maxTokens: threshold,
            targetRatio: this.compactionControl?.targetRatio || 0.8,
            injectSummary: true,
            summaryPrefix: this.compactionControl?.summaryPrefix || "Compaction summary"
        });
        return {
            removedMessagesCount: result.removedMessagesCount,
            newTokenCount: result.newTokenCount
        };
    }

    /**
     * Executes the agent loop synchronously (blocking until final text)
     */
    async run(input: string): Promise<string> {
        let finalResponse = "";
        for await (const event of this.runStream(input)) {
            if (event.type === 'result') {
                finalResponse = event.result;
            }
        }
        return finalResponse;
    }

    /**
     * Executes the agent loop returning a Query object.
     */
    runStream(input: string): Query {
        const self = this;

        // Intercept Slash Commands
        if (this.commandRegistry.isCommand(input)) {
            const generator = this.commandRegistry.execute(input, this);
            return {
                [Symbol.asyncIterator]() { return this; },
                next(...args: [] | [unknown]) { return generator.next(...args); },
                return(value: any) { return generator.return(value); },
                throw(e: any) { return generator.throw(e); },
                async [Symbol.asyncDispose]() { await generator.return(undefined); },
                interrupt() { }, // Commands are generally fast/non-interruptible
                close() { },
                async promptSuggestion() { return self.generatePromptSuggestions(); },
                setPermissionMode() { }
            };
        }

        const generator = this._runStreamInternal(input);

        return {
            [Symbol.asyncIterator]() {
                return this;
            },
            next(...args: [] | [unknown]) {
                return generator.next(...args);
            },
            return(value: any) {
                return generator.return(value);
            },
            throw(e: any) {
                return generator.throw(e);
            },
            async [Symbol.asyncDispose]() {
                self.isInterrupted = true;
                await generator.return(undefined);
            },
            interrupt() {
                self.isInterrupted = true;
            },
            close() {
                self.isInterrupted = true;
            },
            async promptSuggestion() {
                return self.generatePromptSuggestions();
            },
            setPermissionMode(mode: PermissionMode) {
                self.permissionManager.setMode(mode);
            }
        };
    }

    private toSDKError(
        source: SDKError["source"],
        code: string,
        message: string,
        details?: Record<string, any>,
        retryable = false
    ): SDKError {
        return { source, code, message, details, retryable };
    }

    private generatePromptSuggestions(): string[] {
        const messages = this.session.getMessages();
        const recent = [...messages].reverse();
        const lastToolError = recent.find((m) => m.role === "toolResult" && m.isError);
        if (lastToolError?.text) {
            return [
                `Investigate and fix this tool error: ${String(lastToolError.text).slice(0, 160)}`,
                "Retry using a safer alternative approach and explain each step.",
                "Summarize likely root causes and propose a minimal fix plan."
            ];
        }

        const lastAssistant = recent.find((m) => m.role === "assistant" && typeof m.text === "string" && m.text.trim().length > 0);
        if (lastAssistant?.text) {
            return [
                `Continue from your last result and implement the next concrete step.`,
                "Provide a concise validation checklist and run it.",
                "Summarize the current status and remaining gaps."
            ];
        }

        return [
            "Describe the objective, constraints, and acceptance criteria.",
            "Ask for a step-by-step implementation plan with verification commands.",
            "Request a risk review before applying changes."
        ];
    }

    private captureConfigSnapshot(): Map<string, number> {
        const candidates = [
            join(this.workingDirectory, "CLAUDE.md"),
            join(this.workingDirectory, "AGENTS.md"),
            join(this.workingDirectory, ".mcp.json"),
            join(this.workingDirectory, ".claude", "settings.json"),
            join(this.workingDirectory, ".claude", "hooks", "hooks.json"),
            join(this.workingDirectory, ".omniagent", "config.json"),
            join(this.workingDirectory, ".omniagent", "policies.json")
        ];
        const snapshot = new Map<string, number>();
        for (const file of candidates) {
            if (!existsSync(file)) continue;
            try {
                snapshot.set(file, statSync(file).mtimeMs);
            } catch {
                // ignore stat failures
            }
        }
        return snapshot;
    }

    private detectConfigChanges(): Array<{ path: string; change: "created" | "modified" | "deleted" }> {
        const next = this.captureConfigSnapshot();
        const changes: Array<{ path: string; change: "created" | "modified" | "deleted" }> = [];

        for (const [path, mtime] of next.entries()) {
            if (!this.configState.has(path)) {
                changes.push({ path, change: "created" });
                continue;
            }
            const oldMtime = this.configState.get(path)!;
            if (oldMtime !== mtime) {
                changes.push({ path, change: "modified" });
            }
        }

        for (const path of this.configState.keys()) {
            if (!next.has(path)) {
                changes.push({ path, change: "deleted" });
            }
        }

        this.configState = next;
        return changes;
    }

    private async * _runStreamInternal(input: string): AsyncGenerator<SDKEvent, void, unknown> {
        this.isInterrupted = false;
        let didEmitTerminalResult = false;
        this.session.addMessage({ role: "user", text: input, content: input, uuid: randomUUID() });
        if (this.activatedSkills.length > 0) {
            void this.eventLogStore?.append({
                ts: Date.now(),
                type: "skill_runtime_activated",
                payload: {
                    count: this.activatedSkills.length,
                    skills: this.activatedSkills.map((skill) => ({
                        name: skill.name,
                        source: skill.source,
                        references: skill.resources?.references.length || 0,
                        scripts: skill.resources?.scripts.length || 0,
                        assets: skill.resources?.assets.length || 0
                    }))
                }
            });
        }

        const bubbledEvents: SDKEvent[] = [];
        const onStatus = (data: any) => {
            bubbledEvents.push({
                type: 'status',
                subtype: 'info',
                message: data.message,
                uuid: data.uuid || randomUUID()
            });
        };
        const onTaskNotification = (data: any) => {
            const subtype = data?.subtype;
            if (!subtype) return;
            this.otelManager?.counter("task.notification", 1, { subtype: String(subtype) });
            void this.eventLogStore?.append({
                ts: Date.now(),
                type: "task_notification",
                subtype: String(subtype),
                payload: {
                    task_id: data.task_id ? String(data.task_id) : "",
                    tool_use_id: data.tool_use_id ? String(data.tool_use_id) : undefined,
                    agent_name: data.agent_name ? String(data.agent_name) : undefined
                }
            });
            bubbledEvents.push({
                type: "task_notification",
                subtype,
                task_id: String(data.task_id || ""),
                tool_use_id: data.tool_use_id ? String(data.tool_use_id) : undefined,
                agent_name: data.agent_name ? String(data.agent_name) : undefined,
                message: data.message ? String(data.message) : undefined,
                uuid: data.uuid || randomUUID()
            });
        };
        const onRequestUserInput = (data: any) => {
            const parsed = parseRequestUserInputPayload(data);
            if (!parsed) return;
            this.otelManager?.counter("request_user_input", 1, { provider: this.provider.name });
            void this.eventLogStore?.append({
                ts: Date.now(),
                type: "request_user_input",
                payload: {
                    call_id: parsed.call_id,
                    turn_id: parsed.turn_id,
                    questions_count: parsed.questions.length
                }
            });
            bubbledEvents.push({
                type: "request_user_input",
                payload: parsed,
                uuid: data.uuid || randomUUID()
            });
        };
        const onPlanUpdate = (data: any) => {
            const parsed = parsePlanUpdatePayload(data);
            if (!parsed) return;
            this.otelManager?.counter("plan.update", 1, { provider: this.provider.name });
            void this.eventLogStore?.append({
                ts: Date.now(),
                type: "plan_update",
                payload: {
                    explanation: parsed.explanation,
                    steps_count: parsed.plan.length
                }
            });
            bubbledEvents.push({
                type: "plan_update",
                payload: parsed,
                uuid: data.uuid || randomUUID()
            });
        };
        this.session.eventBus.on("status", onStatus);
        this.session.eventBus.on("task_notification", onTaskNotification);
        this.session.eventBus.on("request_user_input", onRequestUserInput);
        this.session.eventBus.on("plan_update", onPlanUpdate);

        try {
            if (this.hookManager) {
                yield { type: 'hook', subtype: 'started', hook_name: 'SessionStart', event: 'SessionStart', uuid: randomUUID() };
                await this.hookManager.emit("SessionStart", { input });
                yield { type: 'hook', subtype: 'response', hook_name: 'SessionStart', event: 'SessionStart', uuid: randomUUID() };
            }
            this.configState = this.captureConfigSnapshot();

            let turnCount = 0;
            yield { type: 'status', subtype: 'info', message: 'Agent loop started', uuid: randomUUID() };

            while (turnCount < this.maxTurns) {
                // Yield any bubbled events from sub-agents or tools
                while (bubbledEvents.length > 0) {
                    yield bubbledEvents.shift()!;
                }

                if (this.isInterrupted) {
                    const error = this.toSDKError("core", "INTERRUPTED", "Interrupted by user");
                    yield { type: 'result', subtype: 'error', result: 'Interrupted by user', error, uuid: randomUUID() };
                    didEmitTerminalResult = true;
                    return;
                }

                turnCount++;
                this.otelManager?.counter("turn.started", 1, {
                    provider: this.provider.name,
                    agent: this.agentName || "default"
                });
                void this.eventLogStore?.append({
                    ts: Date.now(),
                    type: "turn_started",
                    payload: { turn: turnCount, provider: this.provider.name, agent: this.agentName }
                });
                const currentCost = this.session.calculateApproximateCost();
                if (this.maxCostUsd !== undefined && currentCost > this.maxCostUsd) {
                    const message = `Execution budget exceeded: $${currentCost.toFixed(4)} > $${this.maxCostUsd.toFixed(4)}`;
                    const sdkError = this.toSDKError("permission", "BUDGET_EXCEEDED", message, {
                        maxCostUsd: this.maxCostUsd,
                        currentCost
                    }, false);
                    yield { type: "status", subtype: "error", message, error: sdkError, uuid: randomUUID() };
                    yield { type: "result", subtype: "error", result: message, error: sdkError, uuid: randomUUID() };
                    didEmitTerminalResult = true;
                    return;
                }

                if (this.policyEngine) {
                    const turnDecision = this.policyEngine.evaluateTurn({
                        agentName: this.agentName,
                        turnCount,
                        costUsd: currentCost,
                        permissionMode: this.permissionManager.getMode()
                    });
                    if (turnDecision?.behavior === "deny") {
                        const message = turnDecision.reason || "Denied by policy engine.";
                        const sdkError = this.toSDKError("permission", "POLICY_DENIED_TURN", message, {
                            policyRuleId: (turnDecision as any).ruleId,
                            turnCount,
                            currentCost
                        }, false);
                        yield { type: "status", subtype: "error", message, error: sdkError, uuid: randomUUID() };
                        yield { type: "result", subtype: "error", result: message, error: sdkError, uuid: randomUUID() };
                        didEmitTerminalResult = true;
                        return;
                    }
                }

                const { steering, followUp } = this.session.consumeQueues();

                if (steering.length > 0) {
                    this.session.addMessage({ role: "user", text: steering.join("\n"), content: steering.join("\n"), uuid: randomUUID() });
                }

                this.session.eventBus.emit("turnStart", { turnNumber: turnCount });

                if (this.compactionControl?.enabled) {
                    const threshold = this.compactionControl.contextTokenThreshold || 100_000;
                    const estimated = this.session.estimateContextTokens();
                    if (estimated > threshold) {
                        const compacted = this.session.compactHistory({
                            maxTokens: threshold,
                            targetRatio: this.compactionControl.targetRatio || 0.8,
                            injectSummary: true,
                            summaryPrefix: this.compactionControl.summaryPrefix || "Compaction summary"
                        });
                        yield {
                            type: "status",
                            subtype: "info",
                            message: `Auto-compaction applied. removed=${compacted.removedMessagesCount}, tokens=${compacted.newTokenCount}`,
                            uuid: randomUUID()
                        };
                    }
                }

                if (this.hookManager) {
                    const configChanges = this.detectConfigChanges();
                    if (configChanges.length > 0) {
                        yield { type: "hook", subtype: "started", hook_name: "ConfigChange", event: "ConfigChange", uuid: randomUUID() };
                        await this.hookManager.emit("ConfigChange", {
                            changes: configChanges,
                            working_directory: this.workingDirectory
                        });
                        yield { type: "hook", subtype: "response", hook_name: "ConfigChange", event: "ConfigChange", uuid: randomUUID() };
                    }
                }

                // Call LLM Provider
                let providerResponse;
                let routedProviderName: string | undefined;
                let routedModelName: string | undefined;
                try {
                    if (this.toolRunnerMode === "provider_native" && this.provider.runToolsNative) {
                        providerResponse = await this.provider.runToolsNative(
                            this.session.getMessages(),
                            Array.from(this.tools.values())
                        );
                    } else {
                        providerResponse = await this.provider.generateText(
                            this.session.getMessages(),
                            Array.from(this.tools.values())
                        );
                    }
                    const routeInfo = (this.provider as any).getLastRoute?.();
                    routedProviderName = routeInfo?.provider || providerResponse.provider || this.provider.name;
                    routedModelName =
                        routeInfo?.model ||
                        providerResponse.model ||
                        this.provider.getModelLimits?.().model;
                } catch (error: any) {
                    const message = error?.message || "Provider failed to generate response";
                    const sdkError = this.toSDKError("provider", "PROVIDER_GENERATE_TEXT_FAILED", message, {
                        provider: this.provider.name
                    }, true);
                    yield {
                        type: "status",
                        subtype: "error",
                        message: `Provider error (${this.provider.name}): ${message}`,
                        error: sdkError,
                        uuid: randomUUID()
                    };
                    yield {
                        type: "result",
                        subtype: "error",
                        result: message,
                        error: sdkError,
                        uuid: randomUUID()
                    };
                    didEmitTerminalResult = true;
                    return;
                }

                // Track Usage
                if (providerResponse.usage) {
                    this.session.addUsage(providerResponse.usage);
                }

                this.session.addMessage({
                    role: "assistant",
                    text: providerResponse.text,
                    content: providerResponse.text,
                    toolCalls: providerResponse.toolCalls,
                    uuid: randomUUID()
                });

                if (providerResponse.text) {
                    this.otelManager?.counter("assistant.text_emitted", 1, { provider: this.provider.name });
                    void this.eventLogStore?.append({
                        ts: Date.now(),
                        type: "assistant_text",
                        payload: {
                            provider: routedProviderName,
                            model: routedModelName,
                            request_id: providerResponse.requestId
                        }
                    });
                    yield {
                        type: 'text',
                        text: providerResponse.text,
                        request_id: providerResponse.requestId,
                        provider: routedProviderName,
                        model: routedModelName,
                        uuid: randomUUID()
                    };
                }

                if (!providerResponse.toolCalls || providerResponse.toolCalls.length === 0) {
                    if (followUp.length > 0) {
                        this.session.addMessage({ role: "user", text: followUp.join("\n"), content: followUp.join("\n"), uuid: randomUUID() });
                        continue;
                    }
                    const finalRes = providerResponse.text || '';
                    let structured: any;
                    if (this.structuredOutput) {
                        const parsed = parseStructuredResult(
                            finalRes,
                            this.structuredOutput.schema,
                            this.structuredOutput.strict !== false
                        );
                        if (parsed.error) {
                            const message = `Structured output validation failed: ${parsed.error}`;
                            const error = this.toSDKError("core", "STRUCTURED_OUTPUT_INVALID", message, {
                                rawJson: parsed.rawJson
                            });
                            if (this.structuredOutput.failOnValidationError !== false) {
                                yield {
                                    type: "result",
                                    subtype: "error",
                                    result: message,
                                    error,
                                    request_id: providerResponse.requestId,
                                    provider: routedProviderName,
                                    model: routedModelName,
                                    uuid: randomUUID()
                                };
                                didEmitTerminalResult = true;
                                return;
                            }
                            yield {
                                type: "status",
                                subtype: "warning",
                                message,
                                error,
                                uuid: randomUUID()
                            };
                        } else {
                            structured = parsed.value;
                        }
                    }
                    if (this.hookManager) {
                        await this.hookManager.emit("SessionEnd", { result: finalRes });
                    }
                    yield {
                        type: 'result',
                        subtype: 'success',
                        result: finalRes,
                        structured,
                        usage: providerResponse.usage,
                        request_id: providerResponse.requestId,
                        provider: routedProviderName,
                        model: routedModelName,
                        uuid: randomUUID()
                    };
                    this.otelManager?.counter("turn.completed", 1, {
                        provider: routedProviderName || this.provider.name,
                        status: "success"
                    });
                    void this.eventLogStore?.append({
                        ts: Date.now(),
                        type: "turn_completed",
                        payload: {
                            status: "success",
                            provider: routedProviderName,
                            model: routedModelName,
                            request_id: providerResponse.requestId,
                            usage: providerResponse.usage
                        }
                    });
                    didEmitTerminalResult = true;
                    return;
                }

                // Execute Tools
                for (const call of providerResponse.toolCalls) {
                    if (this.isInterrupted) break;

                    const toolUseID = call.id || randomUUID();
                    this.otelManager?.counter("tool.use", 1, {
                        tool: call.name,
                        provider: this.provider.name
                    });
                    void this.eventLogStore?.append({
                        ts: Date.now(),
                        type: "tool_use",
                        payload: {
                            tool: call.name,
                            tool_use_id: toolUseID
                        }
                    });
                    yield { type: 'tool_use', tool: call.name, input: call.args, tool_use_id: toolUseID, uuid: randomUUID() };

                    // Permission Check
                    if (this.hookManager) {
                        yield { type: 'hook', subtype: 'started', hook_name: 'PermissionRequest', event: 'PermissionRequest', uuid: randomUUID() };
                        await this.hookManager.emit("PermissionRequest", { tool: call.name, input: call.args });
                        yield { type: 'hook', subtype: 'response', hook_name: 'PermissionRequest', event: 'PermissionRequest', uuid: randomUUID() };
                    }

                    const perm = await this.permissionManager.checkPermission(call.name, call.args, {
                        agentName: this.agentName,
                        turnCount,
                        costUsd: this.session.calculateApproximateCost()
                    });
                    if (perm.behavior === 'deny') {
                        const denyRes = `Tool execution denied: ${perm.reason || 'No reason provided'}`;
                        const error = this.toSDKError("permission", "TOOL_PERMISSION_DENIED", denyRes, {
                            tool: call.name,
                            suggestions: perm.suggestions
                        });
                        this.session.addMessage({
                            role: "toolResult",
                            text: denyRes,
                            content: denyRes,
                            toolCallId: toolUseID,
                            toolName: call.name,
                            isError: true,
                            uuid: randomUUID()
                        });
                        yield { type: 'tool_result', tool: call.name, result: denyRes, tool_use_id: toolUseID, is_error: true, error, uuid: randomUUID() };
                        continue;
                    }

                    const tool = this.tools.get(call.name);
                    if (!tool) {
                        const errRes = `Error: Tool not found ${call.name}`;
                        const error = this.toSDKError("tool", "TOOL_NOT_FOUND", errRes, { tool: call.name });
                        this.session.addMessage({
                            role: "toolResult",
                            text: errRes,
                            content: errRes,
                            toolCallId: toolUseID,
                            toolName: call.name,
                            isError: true,
                            uuid: randomUUID()
                        });
                        yield { type: 'tool_result', tool: call.name, result: errRes, tool_use_id: toolUseID, is_error: true, error, uuid: randomUUID() };
                        continue;
                    }

                    try {
                        let argsToUse = call.args;
                        if (this.hookManager) {
                            yield { type: 'hook', subtype: 'started', hook_name: 'PreToolUse', event: 'PreToolUse', uuid: randomUUID() };
                            const preHookRes = await this.hookManager.emit("PreToolUse", { tool: call.name, args: call.args });

                            if (preHookRes.block) {
                                const blockRes = `Tool blocked by PreToolUse hook: ${preHookRes.reason}`;
                                const error = this.toSDKError("hook", "TOOL_BLOCKED_BY_HOOK", blockRes, { tool: call.name });
                                this.session.addMessage({
                                    role: "toolResult",
                                    text: blockRes,
                                    content: blockRes,
                                    toolCallId: toolUseID,
                                    toolName: call.name,
                                    isError: true,
                                    uuid: randomUUID()
                                });
                                yield { type: 'tool_result', tool: call.name, result: blockRes, tool_use_id: toolUseID, is_error: true, error, uuid: randomUUID() };
                                continue;
                            }
                            if (preHookRes.args) {
                                argsToUse = preHookRes.args;
                            }
                            yield { type: 'hook', subtype: 'response', hook_name: 'PreToolUse', event: 'PreToolUse', uuid: randomUUID() };
                        }

                        yield { type: 'status', subtype: 'progress', message: `Executing ${call.name}...`, uuid: randomUUID() };
                        const result = await tool.execute(argsToUse, {
                            sandbox: this.sandbox,
                            loop: this,
                            workingDirectory: this.workingDirectory,
                            toolUseId: toolUseID
                        });

                        let finalResult = result;
                        if (this.hookManager) {
                            yield { type: 'hook', subtype: 'started', hook_name: 'PostToolUse', event: 'PostToolUse', uuid: randomUUID() };
                            const postHookRes = await this.hookManager.emit("PostToolUse", { tool: call.name, result });
                            if (postHookRes.result) {
                                finalResult = postHookRes.result;
                            }
                            yield { type: 'hook', subtype: 'response', hook_name: 'PostToolUse', event: 'PostToolUse', uuid: randomUUID() };
                        }

                        this.session.addMessage({
                            role: "toolResult",
                            text: finalResult,
                            content: finalResult,
                            toolCallId: toolUseID,
                            toolName: call.name,
                            uuid: randomUUID()
                        });
                        this.otelManager?.counter("tool.result", 1, { tool: call.name, status: "success" });
                        void this.eventLogStore?.append({
                            ts: Date.now(),
                            type: "tool_result",
                            payload: { tool: call.name, tool_use_id: toolUseID, status: "success" }
                        });
                        yield { type: 'tool_result', tool: call.name, result: finalResult, tool_use_id: toolUseID, uuid: randomUUID() };
                    } catch (error: any) {
                        const errRes = error?.message || String(error);
                        const sdkError = this.toSDKError("tool", "TOOL_EXECUTION_FAILED", errRes, { tool: call.name }, false);
                        this.session.addMessage({
                            role: "toolResult",
                            text: errRes,
                            content: errRes,
                            toolCallId: toolUseID,
                            toolName: call.name,
                            isError: true,
                            uuid: randomUUID()
                        });
                        this.otelManager?.counter("tool.result", 1, { tool: call.name, status: "error" });
                        void this.eventLogStore?.append({
                            ts: Date.now(),
                            type: "tool_result",
                            payload: {
                                tool: call.name,
                                tool_use_id: toolUseID,
                                status: "error",
                                error: errRes
                            }
                        });
                        yield { type: 'tool_result', tool: call.name, result: errRes, tool_use_id: toolUseID, is_error: true, error: sdkError, uuid: randomUUID() };
                    }
                }
            }

            if (!this.isInterrupted) {
                throw new Error("Max turns reached without finalizing response.");
            }
        } catch (error: any) {
            const message = error?.message || "Unknown loop error";
            const sdkError = this.toSDKError("core", "AGENT_LOOP_FAILED", message);
            yield {
                type: "status",
                subtype: "error",
                message: `Agent loop failed: ${message}`,
                error: sdkError,
                uuid: randomUUID()
            };
            this.otelManager?.counter("turn.completed", 1, {
                provider: this.provider.name,
                status: "error"
            });
            void this.eventLogStore?.append({
                ts: Date.now(),
                type: "turn_completed",
                payload: { status: "error", error: message, provider: this.provider.name }
            });
            yield {
                type: "result",
                subtype: "error",
                result: message,
                error: sdkError,
                uuid: randomUUID()
            };
            didEmitTerminalResult = true;
        } finally {
            this.session.eventBus.off("status", onStatus);
            this.session.eventBus.off("task_notification", onTaskNotification);
            this.session.eventBus.off("request_user_input", onRequestUserInput);
            this.session.eventBus.off("plan_update", onPlanUpdate);
            if (this.isInterrupted && !didEmitTerminalResult) {
                const error = this.toSDKError("core", "INTERRUPTED", "Interrupted by user");
                yield { type: 'result', subtype: 'error', result: 'Interrupted by user', error, uuid: randomUUID() };
                didEmitTerminalResult = true;
            }
            try {
                await this.eventLogStore?.shutdown();
            } catch {
                // best-effort shutdown: runtime should not fail on logging backend errors
            }
        }
    }
}
