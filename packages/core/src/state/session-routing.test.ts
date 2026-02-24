import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentMainSessionKey, buildAgentPeerSessionKey } from "./session-routing.js";

test("session routing builds main and direct scopes", () => {
    assert.equal(buildAgentMainSessionKey("worker"), "agent:worker:main");
    assert.equal(
        buildAgentPeerSessionKey({
            agentId: "worker",
            peer: { kind: "direct", id: "u-1" },
            dmScope: "per-peer"
        }),
        "agent:worker:direct:u-1"
    );
});

test("session routing builds per channel/account scopes", () => {
    assert.equal(
        buildAgentPeerSessionKey({
            agentId: "worker",
            channel: "telegram",
            accountId: "acc-a",
            peer: { kind: "direct", id: "u-1" },
            dmScope: "per-account-channel-peer"
        }),
        "agent:worker:telegram:acc-a:direct:u-1"
    );
});

test("session routing collapses direct peers using identity links", () => {
    assert.equal(
        buildAgentPeerSessionKey({
            agentId: "worker",
            channel: "telegram",
            peer: { kind: "direct", id: "123" },
            dmScope: "per-peer",
            identityLinks: { "john-doe": ["telegram:123", "discord:abc"] }
        }),
        "agent:worker:direct:john-doe"
    );
});

