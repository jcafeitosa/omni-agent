import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentManager } from "./agent-manager.js";
import type { Provider, ProviderModelLimits, ToolDefinition } from "../index.js";

function createProvider(onGenerate?: (tools?: ToolDefinition[]) => void): Provider {
    return {
        name: "mock",
        async generateText(_messages, tools) {
            onGenerate?.(tools);
            return { text: "ok", toolCalls: [] };
        },
        async embedText() {
            return [0.1];
        },
        async embedBatch(texts) {
            return texts.map(() => [0.1]);
        },
        getModelLimits(model?: string): ProviderModelLimits {
            return {
                provider: "mock",
                model: model || "mock-model",
                contextWindowTokens: null,
                maxOutputTokens: null,
                maxInputTokens: null,
                source: "unknown"
            };
        }
    };
}

test("agent manager parses kebab-case frontmatter and maps generic CLI tool names", async () => {
    const root = mkdtempSync(join(tmpdir(), "omni-agent-manager-test-"));
    const agentsDir = join(root, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
        join(agentsDir, "reviewer.md"),
        `---
name: reviewer
description: reviewer agent
model: inherit
max-turns: 1
max-cost-usd: 2.5
permission-mode: plan
allowed-agents: worker-a,worker-b
tools: Read, Grep, LS
---
You are a reviewer.
`
    );

    let receivedTools: string[] = [];
    const providers = new Map<string, Provider>([
        ["default", createProvider((tools) => (receivedTools = (tools || []).map((t) => t.name)))]
    ]);
    const tools = new Map<string, ToolDefinition>([
        ["read_file", { name: "read_file", description: "read", parameters: z.object({}), execute: async () => "ok" }],
        ["rip_grep", { name: "rip_grep", description: "grep", parameters: z.object({}), execute: async () => "ok" }],
        ["glob", { name: "glob", description: "glob", parameters: z.object({}), execute: async () => "ok" }]
    ]);

    try {
        const manager = new AgentManager({
            providers,
            tools,
            defaultModelConfig: { provider: "default", model: "mock-model" },
            agentDirectories: [agentsDir],
            autoLoadAgents: true,
            autoLoadSkills: false
        });
        const agent = manager.createAgent("reviewer");
        await agent.run("test");

        assert.equal(manager.canSpawnSubagent("reviewer", "worker-a"), true);
        assert.equal(manager.canSpawnSubagent("reviewer", "worker-z"), false);
        assert.equal(receivedTools.includes("read_file"), true);
        assert.equal(receivedTools.includes("rip_grep"), true);
        assert.equal(receivedTools.includes("glob"), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("agent manager applies managed enterprise policy precedence", async () => {
    const root = mkdtempSync(join(tmpdir(), "omni-agent-manager-policy-test-"));
    const agentsDir = join(root, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
        join(agentsDir, "runner.md"),
        `---
name: runner
description: runner agent
tools: bash
---
Run shell commands.
`
    );

    const providers = new Map<string, Provider>([
        [
            "default",
            {
                ...createProvider(),
                async generateText() {
                    return {
                        text: "",
                        toolCalls: [{ id: "t1", name: "bash", args: { command: "rm -rf /tmp/demo" } }]
                    };
                }
            }
        ]
    ]);
    const tools = new Map<string, ToolDefinition>([
        ["bash", { name: "bash", description: "bash", parameters: z.object({ command: z.string() }), execute: async () => "ok" }]
    ]);

    try {
        const manager = new AgentManager({
            providers,
            tools,
            defaultModelConfig: { provider: "default", model: "mock-model" },
            agentDirectories: [agentsDir],
            autoLoadAgents: true,
            autoLoadSkills: false,
            managedPolicies: [
                {
                    tier: "workspace",
                    rules: [{ id: "allow-bash", effect: "allow", tools: ["bash"] }]
                },
                {
                    tier: "enterprise",
                    prefixRules: [
                        {
                            id: "deny-rm",
                            decision: "forbidden",
                            pattern: ["rm"],
                            justification: "blocked by enterprise"
                        }
                    ]
                }
            ]
        });

        const events: Array<any> = [];
        for await (const event of manager.createAgent("runner").runStream("go")) {
            events.push(event);
            if (event.type === "result") break;
        }
        const deniedToolResult = events.find((event) => event.type === "tool_result" && event.is_error === true);
        assert.equal(Boolean(deniedToolResult), true);
        assert.match(String(deniedToolResult?.result || ""), /denied/i);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
