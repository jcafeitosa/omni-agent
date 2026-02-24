import test from "node:test";
import assert from "node:assert/strict";
import { AgentManager } from "./agent-manager.js";
import { AgentCommunicationHub } from "./agent-communication.js";
import type { Provider, ProviderModelLimits, ToolDefinition } from "../index.js";

function createProvider(result = "ok"): Provider {
    return {
        name: "mock",
        async generateText() {
            return { text: result, toolCalls: [] };
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

function createManager(): AgentManager {
    const providers = new Map<string, Provider>([["default", createProvider("worker done")]]);
    const tools = new Map<string, ToolDefinition>();
    return new AgentManager({
        providers,
        tools,
        defaultModelConfig: { provider: "default", model: "mock-model" },
        autoLoadAgents: false,
        autoLoadSkills: false
    });
}

test("orchestrator requires mandatory communication policy", async () => {
    const manager = createManager();
    const orchestrator = manager.createOrchestrator();
    await assert.rejects(
        () =>
            orchestrator.runPlan({
                tasks: [{ id: "t1", query: "run" }]
            }),
        /Mandatory communication policy not configured/i
    );
});

test("orchestrator posts mandatory task lifecycle updates to main channel", async () => {
    const manager = createManager();
    const hub = new AgentCommunicationHub();
    const workspaceId = "ws-main";
    hub.ensureWorkspace(workspaceId);
    hub.registerAgent(workspaceId, {
        id: "orchestrator",
        displayName: "Orchestrator",
        role: "owner"
    });
    const main = hub.createChannel({
        workspaceId,
        id: "general:main",
        name: "main",
        type: "general",
        createdBy: "orchestrator"
    });

    const orchestrator = manager.createOrchestrator({
        hub,
        workspaceId,
        mainChannelId: main.id,
        orchestratorId: "orchestrator"
    });

    const result = await orchestrator.runPlan({
        tasks: [
            {
                id: "t1",
                query: "run",
                customDefinition: {
                    prompt: "You are worker",
                    maxTurns: 2
                }
            }
        ]
    });

    assert.equal(result.completed.length, 1);
    const messages = hub.listMessages(workspaceId, main.id);
    assert.equal(messages.some((m) => m.text.includes("[task_started]")), true);
    assert.equal(messages.some((m) => m.text.includes("[task_completed]")), true);
    assert.equal(messages.some((m) => m.text.includes("pessoal")), true);
    assert.equal(messages.some((m) => m.text.includes("update rapido")), true);
});

test("orchestrator creates temporary team channel, adds participants, and deletes on disband", () => {
    const manager = createManager();
    const hub = new AgentCommunicationHub();
    const workspaceId = "ws-team";
    hub.ensureWorkspace(workspaceId);
    hub.registerAgent(workspaceId, {
        id: "orchestrator",
        displayName: "Orchestrator",
        role: "owner"
    });
    const main = hub.createChannel({
        workspaceId,
        id: "general:main",
        name: "main",
        type: "general",
        createdBy: "orchestrator"
    });

    const orchestrator = manager.createOrchestrator({
        hub,
        workspaceId,
        mainChannelId: main.id,
        orchestratorId: "orchestrator"
    });

    const team = orchestrator.createTeam({
        id: "platform",
        participants: ["alice", "bob"]
    });

    const createdChannel = hub.listChannels(workspaceId).find((c) => c.id === team.teamChannelId);
    assert.ok(createdChannel);
    assert.equal(createdChannel?.members.has("alice"), true);
    assert.equal(createdChannel?.members.has("bob"), true);
    assert.equal(hub.listChannelsForAgent(workspaceId, "alice").some((c) => c.id === main.id), true);
    assert.equal(orchestrator.listTeams().length, 1);

    orchestrator.disbandTeam("platform");
    assert.equal(hub.listChannels(workspaceId).some((c) => c.id === team.teamChannelId), false);
    assert.equal(orchestrator.listTeams().length, 0);
});

test("orchestrator has CRUD authority over communication channels", () => {
    const manager = createManager();
    const hub = new AgentCommunicationHub();
    const workspaceId = "ws-crud";
    hub.ensureWorkspace(workspaceId);
    hub.registerAgent(workspaceId, {
        id: "orchestrator",
        displayName: "Orchestrator",
        role: "owner"
    });
    const main = hub.createChannel({
        workspaceId,
        id: "general:main",
        name: "main",
        type: "general",
        createdBy: "orchestrator"
    });
    const orchestrator = manager.createOrchestrator({
        hub,
        workspaceId,
        mainChannelId: main.id,
        orchestratorId: "orchestrator"
    });

    const department = orchestrator.createCommunicationChannel({
        name: "eng-department",
        type: "department",
        department: "engineering"
    });
    assert.equal(department.type, "department");
    const updated = orchestrator.updateCommunicationChannel(department.id, { name: "eng-platform" });
    assert.equal(updated.name, "eng-platform");
    orchestrator.deleteCommunicationChannel(department.id);
    assert.equal(hub.listChannels(workspaceId).some((c) => c.id === department.id), false);
});
