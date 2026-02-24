import { AgentSession } from "../state/session.js";
import { AgentMessage, ToolCall, SDKEvent, SDKError } from "../types/messages.js";
import { ToolDefinition, Provider, Sandbox } from "../index.js";
import { HookManager } from "../state/hook-manager.js";
import { randomUUID } from "node:crypto";

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
}

/**
 * High-level interface to an agentic query, aligned with Claude SDK.
 */
export interface Query extends AsyncGenerator<SDKEvent, void, unknown> {
    interrupt(): void;
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
    private isInterrupted = false;

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

        this.contextLoader = new ContextLoader();

        // Load project constitution if available
        const constitution = this.contextLoader.loadConstitution(process.cwd());
        if (constitution) {
            const currentPrompt = this.session.getSystemPrompt();
            this.session.setSystemPrompt(`${currentPrompt}\n\nProject Constitution (CLAUDE.md):\n${constitution}`);
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

    private async * _runStreamInternal(input: string): AsyncGenerator<SDKEvent, void, unknown> {
        this.isInterrupted = false;
        let didEmitTerminalResult = false;
        this.session.addMessage({ role: "user", text: input, content: input, uuid: randomUUID() });

        const bubbledEvents: SDKEvent[] = [];
        const onStatus = (data: any) => {
            bubbledEvents.push({
                type: 'status',
                subtype: 'info',
                message: data.message,
                uuid: data.uuid || randomUUID()
            });
        };
        this.session.eventBus.on("status", onStatus);

        try {
            if (this.hookManager) {
                yield { type: 'hook', subtype: 'started', hook_name: 'SessionStart', event: 'SessionStart', uuid: randomUUID() };
                await this.hookManager.emit("SessionStart", { input });
                yield { type: 'hook', subtype: 'response', hook_name: 'SessionStart', event: 'SessionStart', uuid: randomUUID() };
            }

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

                // Call LLM Provider
                let providerResponse;
                try {
                    providerResponse = await this.provider.generateText(
                        this.session.getMessages(),
                        Array.from(this.tools.values())
                    );
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
                    yield { type: 'text', text: providerResponse.text, uuid: randomUUID() };
                }

                if (!providerResponse.toolCalls || providerResponse.toolCalls.length === 0) {
                    if (followUp.length > 0) {
                        this.session.addMessage({ role: "user", text: followUp.join("\n"), content: followUp.join("\n"), uuid: randomUUID() });
                        continue;
                    }
                    const finalRes = providerResponse.text || '';
                    if (this.hookManager) {
                        await this.hookManager.emit("SessionEnd", { result: finalRes });
                    }
                    yield { type: 'result', subtype: 'success', result: finalRes, uuid: randomUUID() };
                    didEmitTerminalResult = true;
                    return;
                }

                // Execute Tools
                for (const call of providerResponse.toolCalls) {
                    if (this.isInterrupted) break;

                    const toolUseID = call.id || randomUUID();
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
                        const error = this.toSDKError("permission", "TOOL_PERMISSION_DENIED", denyRes, { tool: call.name });
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
                            workingDirectory: process.cwd()
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
            if (this.isInterrupted && !didEmitTerminalResult) {
                const error = this.toSDKError("core", "INTERRUPTED", "Interrupted by user");
                yield { type: 'result', subtype: 'error', result: 'Interrupted by user', error, uuid: randomUUID() };
                didEmitTerminalResult = true;
            }
        }
    }
}
