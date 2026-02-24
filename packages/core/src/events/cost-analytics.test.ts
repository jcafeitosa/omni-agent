import test from "node:test";
import assert from "node:assert/strict";
import { estimateUsageCostUsd, summarizeTurnCosts } from "./cost-analytics.js";
import type { EventLogEntry } from "../state/event-log-store.js";

test("estimateUsageCostUsd computes using token rates", () => {
    const cost = estimateUsageCostUsd(
        { inputTokens: 1_000_000, outputTokens: 500_000, thinkingTokens: 500_000 },
        { inputUsdPerMillion: 2, outputUsdPerMillion: 8, thinkingUsdPerMillion: 4 }
    );
    assert.equal(cost, 8);
});

test("summarizeTurnCosts uses provider/model rules and skips failed turns by default", () => {
    const events: EventLogEntry[] = [
        {
            ts: 1,
            type: "turn_completed",
            payload: {
                status: "success",
                provider: "oauth-provider",
                model: "x-1",
                usage: { inputTokens: 100_000, outputTokens: 10_000 }
            }
        },
        {
            ts: 2,
            type: "turn_completed",
            payload: {
                status: "error",
                provider: "oauth-provider",
                model: "x-1",
                usage: { inputTokens: 100_000, outputTokens: 100_000 }
            }
        }
    ];

    const summary = summarizeTurnCosts(events, {
        rules: [
            {
                provider: "oauth-provider",
                model: "x-1",
                rate: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 }
            }
        ]
    });

    assert.equal(summary.totalTurns, 1);
    assert.equal(typeof summary.rateCardVersion, "string");
    assert.equal(summary.totalInputTokens, 100_000);
    assert.equal(summary.totalOutputTokens, 10_000);
    assert.ok(Math.abs(summary.totalEstimatedCostUsd - 0.12) < 1e-9);
    assert.ok(Math.abs(summary.byProvider["oauth-provider"] - 0.12) < 1e-9);
    assert.ok(Math.abs(summary.byModel["x-1"] - 0.12) < 1e-9);
});

test("summarizeTurnCosts applies built-in rate card when custom rules are not provided", () => {
    const events: EventLogEntry[] = [
        {
            ts: 10,
            type: "turn_completed",
            payload: {
                status: "success",
                provider: "ollama",
                model: "llama3.1",
                usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }
            }
        }
    ];
    const summary = summarizeTurnCosts(events);
    assert.equal(summary.totalTurns, 1);
    assert.equal(summary.totalEstimatedCostUsd, 0);
});
