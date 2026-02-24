// Core State
export * from "./state/session.js";
export * from "./state/session-store.js";
export * from "./state/compaction.js";
export * from "./state/agent-manager.js";
export * from "./state/agent-orchestrator.js";
export * from "./state/hook-manager.js";
export * from "./state/hook-rule-engine.js";
export * from "./state/plugin-manager.js";
export * from "./state/plugin-scaffold.js";
export * from "./state/connector-registry.js";
export * from "./state/agent-communication.js";
export * from "./state/agent-communication-store.js";
export * from "./state/agent-communication-event-log.js";
export * from "./state/agent-communication-realtime.js";
export * from "./state/tasks-board.js";
export * from "./state/vector-store.js";
export * from "./state/persistent-vector-store.js";
export * from "./state/indexer.js";
export * from "./state/context-loader.js";
export * from "./state/session-routing.js";
export * from "./state/heartbeat-service.js";
export * from "./state/skill-manager.js";
export * from "./state/worktree-manager.js";
export * from "./state/memory-store.js";
export * from "./state/permissions.js";
export * from "./state/policy-engine.js";
export * from "./state/managed-policy.js";
export * from "./state/exec-policy.js";
export * from "./state/event-log-store.js";
export * from "./state/admin-controls.js";
export * from "./state/workspace-trust.js";
export * from "./state/policy-integrity.js";
export * from "./tools/delegate.js";
export * from "./tools/parallel-delegate.js";
export * from "./tools/subagent.js";
export * from "./utils/diff.js";
export * from "./security/sandbox.js";
export * from "./security/local-provider.js";
export * from "./security/docker-provider.js";
export * from "./security/findings-filter.js";
export * from "./security/run-reservation.js";
export * from "./security/security-review.js";
export type { Query } from "./loops/agent-loop.js";

// Core Loops
export * from "./loops/agent-loop.js";

// Core Types
export * from "./types/messages.js";

// Core Events
export * from "./events/event-bus.js";
export * from "./events/otel-lite.js";
export * from "./events/protocol-events.js";
export * from "./events/event-jsonl-processor.js";
export * from "./events/default-rate-card.js";
export * from "./events/analytics-export.js";
export * from "./events/cost-analytics.js";
export * from "./events/session-transcript.js";

// Core Helpers
export * from "./tools/tool-error.js";
export * from "./helpers/structured-output.js";
export * from "./helpers/json-schema-output.js";
export * from "./helpers/json-fallback-parser.js";
export * from "./helpers/structured-result.js";

export * from "./helpers/tool-runner.js";
export * from "./providers/registry.js";
export * from "./auth/index.js";
export * from "./models/model-availability.js";

import { z } from "zod";
import { Sandbox } from "./security/sandbox.js";

export interface ToolDefinition<T = any> {
    name: string;
    description: string;
    parameters: z.ZodType<T>;
    execute: (args: T, context?: { sandbox?: Sandbox; loop?: unknown; workingDirectory?: string; toolUseId?: string }) => Promise<string>;
}

export interface ProviderResponse {
    text: string;
    toolCalls: any[];
    contentParts?: any[];
    requestId?: string;
    provider?: string;
    model?: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        thinkingTokens?: number;
    };
}

export interface ProviderModelLimits {
    provider: string;
    model: string;
    contextWindowTokens: number | null;
    maxOutputTokens: number | null;
    maxInputTokens: number | null;
    source: "catalog" | "configured" | "unknown";
    notes?: string;
    classification?: {
        family: string;
        tier: "flagship" | "balanced" | "fast" | "local" | "specialized";
        latencyClass: "low" | "medium" | "high";
        costClass: "low" | "medium" | "high";
        reasoningClass: "baseline" | "advanced";
        modalities: Array<"text" | "image" | "audio" | "video" | "code">;
        supportsToolCalling: boolean;
        supportsEmbeddings: boolean | "provider-dependent";
        supportsEffort?: boolean;
        supportedEffortLevels?: Array<"low" | "medium" | "high" | "max">;
        supportsAdaptiveThinking?: boolean;
    };
}

import { AgentMessage } from "./types/messages.js";

export interface Provider {
    name: string;
    generateText: (messages: AgentMessage[], tools?: ToolDefinition[], options?: any) => Promise<ProviderResponse>;
    runToolsNative?: (messages: AgentMessage[], tools?: ToolDefinition[], options?: any) => Promise<ProviderResponse>;
    embedText: (text: string) => Promise<number[]>;
    embedBatch: (texts: string[]) => Promise<number[][]>;
    getModelLimits: (model?: string) => ProviderModelLimits;
    getOAuthProfileId?: () => string | undefined;
    listAvailableModels?: () => Promise<string[]>;
}
