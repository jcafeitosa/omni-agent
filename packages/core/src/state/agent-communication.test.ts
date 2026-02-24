import test from "node:test";
import assert from "node:assert/strict";
import { AgentCommunicationHub } from "./agent-communication.js";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentCommunicationStore } from "./agent-communication-store.js";
import { AgentCommunicationEventLog } from "./agent-communication-event-log.js";

test("communication hub enforces team/department channel access", () => {
    const hub = new AgentCommunicationHub();
    const workspaceId = "ws-1";
    hub.ensureWorkspace(workspaceId);
    hub.registerAgent(workspaceId, { id: "a1", displayName: "A1", role: "agent", team: "core", department: "eng" });
    hub.registerAgent(workspaceId, { id: "a2", displayName: "A2", role: "agent", team: "core", department: "eng" });
    hub.registerAgent(workspaceId, { id: "a3", displayName: "A3", role: "agent", team: "sales", department: "biz" });

    const teamCh = hub.createChannel({
        workspaceId,
        name: "core-team",
        type: "team",
        createdBy: "a1",
        team: "core"
    });
    hub.joinChannel(workspaceId, teamCh.id, "a2");
    assert.throws(() => hub.joinChannel(workspaceId, teamCh.id, "a3"));

    const updated = hub.updateChannel({
        workspaceId,
        channelId: teamCh.id,
        requestedBy: "a1",
        name: "core-team-updated"
    });
    assert.equal(updated.name, "core-team-updated");
    assert.throws(() => hub.deleteChannel(workspaceId, teamCh.id, "a3"));
    hub.registerAgent(workspaceId, { id: "admin1", displayName: "Admin", role: "admin" });
    hub.deleteChannel(workspaceId, teamCh.id, "admin1");
    assert.equal(hub.listChannels(workspaceId).length, 0);
});

test("communication hub supports thread, mentions, and reaction", () => {
    const hub = new AgentCommunicationHub();
    const workspaceId = "ws-2";
    hub.ensureWorkspace(workspaceId);
    hub.registerAgent(workspaceId, { id: "lead", displayName: "Lead", role: "team_lead", team: "platform", department: "eng" });
    hub.registerAgent(workspaceId, { id: "dev1", displayName: "Dev1", role: "agent", team: "platform", department: "eng" });
    hub.registerAgent(workspaceId, { id: "dev2", displayName: "Dev2", role: "agent", team: "platform", department: "eng" });

    const channel = hub.createChannel({
        workspaceId,
        name: "platform",
        type: "team",
        createdBy: "lead",
        team: "platform"
    });
    hub.joinChannel(workspaceId, channel.id, "dev1");
    hub.joinChannel(workspaceId, channel.id, "dev2");

    const root = hub.postMessage({
        workspaceId,
        channelId: channel.id,
        senderId: "lead",
        text: "Vamos priorizar @dev1 e @team:platform para incidente"
    });
    assert.equal(root.delivery.recipients.includes("dev1"), true);
    assert.equal(root.delivery.recipients.includes("dev2"), true);

    const reply = hub.postMessage({
        workspaceId,
        channelId: channel.id,
        senderId: "dev1",
        text: "Entendido",
        threadRootId: root.message.id
    });
    hub.addReaction(workspaceId, channel.id, reply.message.id, "dev2", "eyes");

    const thread = hub.listMessages(workspaceId, channel.id, { threadRootId: root.message.id });
    assert.equal(thread.length, 2);
    assert.deepEqual(thread[1].reactions["eyes"], ["dev2"]);

    const found = hub.searchMessages(workspaceId, "incidente dev1", { channelId: channel.id, limit: 5 });
    assert.equal(found.length >= 1, true);
    assert.equal(found[0].id, root.message.id);
});

test("communication store persists and reloads hub state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-comm-store-"));
    const stateFile = join(dir, "state.json");
    const store = new AgentCommunicationStore({ filePath: stateFile });

    const hubA = new AgentCommunicationHub();
    hubA.ensureWorkspace("ws");
    hubA.registerAgent("ws", { id: "owner", displayName: "Owner", role: "owner" });
    hubA.registerAgent("ws", { id: "agent-1", displayName: "Agent 1", role: "agent", team: "core" });
    const channel = hubA.createChannel({
        workspaceId: "ws",
        name: "general",
        type: "general",
        createdBy: "owner"
    });
    hubA.joinChannel("ws", channel.id, "agent-1");
    hubA.postMessage({
        workspaceId: "ws",
        channelId: channel.id,
        senderId: "owner",
        text: "hello @agent-1"
    });

    await store.saveFrom(hubA);
    const raw = await readFile(stateFile, "utf8");
    assert.match(raw, /"workspaces"/);

    const hubB = new AgentCommunicationHub();
    await store.loadInto(hubB);
    const channels = hubB.listChannels("ws");
    assert.equal(channels.length, 1);
    const messages = hubB.listMessages("ws", channels[0].id);
    assert.equal(messages.length, 1);
    assert.match(messages[0].text, /hello/);
});

test("communication event log replays snapshot delta deterministically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-comm-log-"));
    const stateFile = join(dir, "state.json");
    const eventsFile = join(dir, "events.jsonl");
    const snapshotStore = new AgentCommunicationStore({ filePath: stateFile });
    const eventLog = new AgentCommunicationEventLog({ filePath: eventsFile });

    const hubA = new AgentCommunicationHub();
    hubA.ensureWorkspace("ws");
    hubA.registerAgent("ws", { id: "owner", displayName: "Owner", role: "owner" });
    const event1 = await eventLog.append({
        kind: "register_agent",
        workspaceId: "ws",
        identity: { id: "owner", displayName: "Owner", role: "owner" }
    });
    await snapshotStore.saveFrom(hubA, { lastEventSeq: event1.seq });

    hubA.registerAgent("ws", { id: "agent-1", displayName: "Agent 1", role: "agent", team: "core", department: "eng" });
    const registerEnvelope = await eventLog.append({
        kind: "register_agent",
        workspaceId: "ws",
        identity: { id: "agent-1", displayName: "Agent 1", role: "agent", team: "core", department: "eng" }
    });
    const channel = hubA.createChannel({
        workspaceId: "ws",
        name: "general",
        type: "general",
        createdBy: "owner"
    });
    const channelEnvelope = await eventLog.append({
        kind: "create_channel",
        workspaceId: "ws",
        channel: { ...channel, members: Array.from(channel.members.values()) }
    });
    const joined = hubA.joinChannel("ws", channel.id, "agent-1");
    const joinEnvelope = await eventLog.append({
        kind: "join_channel",
        workspaceId: "ws",
        channelId: channel.id,
        member: joined.member,
        channelUpdatedAt: joined.channelUpdatedAt
    });
    const posted = hubA.postMessage({
        workspaceId: "ws",
        channelId: channel.id,
        senderId: "owner",
        text: "hello @agent-1"
    });
    const postEnvelope = await eventLog.append({
        kind: "post_message",
        workspaceId: "ws",
        message: posted.message,
        channelUpdatedAt: posted.channelUpdatedAt
    });
    const reacted = hubA.addReaction("ws", channel.id, posted.message.id, "agent-1", "eyes");
    const reactionEnvelope = await eventLog.append({
        kind: "add_reaction",
        workspaceId: "ws",
        channelId: channel.id,
        messageId: posted.message.id,
        agentId: "agent-1",
        emoji: "eyes",
        updatedAt: reacted.updatedAt
    });

    assert.equal(registerEnvelope.seq < channelEnvelope.seq, true);
    assert.equal(joinEnvelope.seq < postEnvelope.seq, true);
    assert.equal(reactionEnvelope.seq > event1.seq, true);

    const hubB = new AgentCommunicationHub();
    const snapshotMeta = await snapshotStore.loadInto(hubB);
    const replay = await eventLog.replayInto(hubB, { fromSeqExclusive: snapshotMeta.lastEventSeq });
    assert.equal(replay.applied, 5);
    assert.equal(replay.failed, 0);
    assert.equal(replay.lastSeq, reactionEnvelope.seq);

    const stateA = hubA.exportState();
    const stateB = hubB.exportState();
    assert.deepEqual(stateB.workspaces, stateA.workspaces);
});

test("communication event log compacts by retention and max entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-comm-log-compact-"));
    const eventsFile = join(dir, "events.jsonl");
    const log = new AgentCommunicationEventLog({ filePath: eventsFile, retentionDays: 2, maxEntries: 2 });
    const now = Date.now();

    await log.append({
        kind: "register_agent",
        workspaceId: "ws",
        identity: { id: "old", displayName: "Old", role: "agent" }
    });
    await log.append({
        kind: "register_agent",
        workspaceId: "ws",
        identity: { id: "new-1", displayName: "New 1", role: "agent" }
    });
    await log.append({
        kind: "register_agent",
        workspaceId: "ws",
        identity: { id: "new-2", displayName: "New 2", role: "agent" }
    });

    const all = await log.readAll();
    const first = all[0];
    const tail = all.slice(1).map((item) => ({
        ...item,
        recordedAt: now - 60_000
    }));
    const rewritten = [{ ...first, recordedAt: now - 5 * 24 * 60 * 60 * 1000 }, ...tail];
    await writeFile(
        eventsFile,
        `${rewritten.map((item) => JSON.stringify(item)).join("\n")}\n`,
        "utf8"
    );

    const stats = await log.compact({ now });
    assert.equal(stats.before, 3);
    assert.equal(stats.after, 2);
    const kept = await log.readAll();
    assert.equal(kept.length, 2);
    assert.equal(kept[0].event.kind, "register_agent");
});

test("communication event log replay can continue on invalid events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-comm-log-replay-"));
    const eventsFile = join(dir, "events.jsonl");
    const log = new AgentCommunicationEventLog({ filePath: eventsFile });

    await log.append({
        kind: "register_agent",
        workspaceId: "ws",
        identity: { id: "owner", displayName: "Owner", role: "owner" }
    });
    await log.append({
        kind: "join_channel",
        workspaceId: "ws",
        channelId: "missing",
        member: { agentId: "owner", role: "owner", joinedAt: Date.now() }
    });

    const hub = new AgentCommunicationHub();
    const replay = await log.replayInto(hub, { continueOnError: true });
    assert.equal(replay.applied, 1);
    assert.equal(replay.failed, 1);
});
