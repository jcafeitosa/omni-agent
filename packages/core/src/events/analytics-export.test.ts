import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportCostSummary, serializeCostSummary } from "./analytics-export.js";
import type { CostSummary } from "./cost-analytics.js";

const sampleSummary: CostSummary = {
    rateCardVersion: "test",
    turns: [
        {
            ts: 1,
            provider: "openai",
            model: "gpt",
            status: "success",
            usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 },
            estimatedCostUsd: 0.001,
            pricingSource: "rule"
        }
    ],
    totalTurns: 1,
    totalInputTokens: 10,
    totalOutputTokens: 5,
    totalThinkingTokens: 0,
    totalEstimatedCostUsd: 0.001,
    byProvider: { openai: 0.001 },
    byModel: { gpt: 0.001 }
};

test("serializeCostSummary supports jsonl and csv", () => {
    const jsonl = serializeCostSummary(sampleSummary, "jsonl");
    assert.match(jsonl, /"provider":"openai"/);
    const csv = serializeCostSummary(sampleSummary, "csv");
    assert.match(csv, /provider,model/);
    assert.match(csv, /openai,gpt/);
});

test("exportCostSummary writes output file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-analytics-export-"));
    const out = join(dir, "costs.csv");
    await exportCostSummary(sampleSummary, out, "csv");
    const raw = await readFile(out, "utf8");
    assert.match(raw, /estimated_cost_usd/);
});

