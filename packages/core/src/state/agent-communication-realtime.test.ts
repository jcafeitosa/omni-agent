import test from "node:test";
import assert from "node:assert/strict";
import { AgentCommunicationHub } from "./agent-communication.js";
import { AgentCommunicationRealtimeGateway } from "./agent-communication-realtime.js";

test("communication realtime gateway publishes hub events with filtering", () => {
    const hub = new AgentCommunicationHub();
    const gateway = new AgentCommunicationRealtimeGateway();
    gateway.bindHub(hub);

    const all: string[] = [];
    const coreOnly: string[] = [];

    const offAll = gateway.subscribe({ workspaceId: "ws" }, (event) => {
        all.push(event.type);
    });
    const offCore = gateway.subscribe({ workspaceId: "ws", channelId: "team:core" }, (event) => {
        coreOnly.push(event.type);
    });

    hub.ensureWorkspace("ws");
    hub.registerAgent("ws", { id: "owner", displayName: "Owner", role: "owner", team: "core" });
    const channel = hub.createChannel({ workspaceId: "ws", name: "core", type: "team", createdBy: "owner", id: "team:core", team: "core" });
    hub.postMessage({ workspaceId: "ws", channelId: channel.id, senderId: "owner", text: "hello" });

    assert.equal(all.includes("workspace_ready"), true);
    assert.equal(all.includes("message_posted"), true);
    assert.equal(coreOnly.includes("workspace_ready"), false);
    assert.equal(coreOnly.includes("message_posted"), true);

    offAll();
    offCore();
    gateway.close();
});

test("communication realtime gateway serializes SSE payload", () => {
    const gateway = new AgentCommunicationRealtimeGateway();
    const raw = gateway.toSse({
        type: "workspace_ready",
        workspaceId: "ws",
        at: 1
    });
    assert.match(raw, /event: workspace_ready/);
    assert.match(raw, /"workspaceId":"ws"/);
});
