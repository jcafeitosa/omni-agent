#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith("--")) continue;
        const key = token.slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
        args[key] = value;
    }
    return args;
}

function parseJsonl(content) {
    return content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function normalizeUsage(usage) {
    return {
        inputTokens: Number(usage?.inputTokens || 0),
        outputTokens: Number(usage?.outputTokens || 0),
        thinkingTokens: Number(usage?.thinkingTokens || 0)
    };
}

function estimateCost(usage, rate) {
    return (
        (usage.inputTokens / 1_000_000) * rate.inputUsdPerMillion +
        (usage.outputTokens / 1_000_000) * rate.outputUsdPerMillion +
        (usage.thinkingTokens / 1_000_000) * (rate.thinkingUsdPerMillion ?? rate.outputUsdPerMillion)
    );
}

async function main() {
    const args = parseArgs(process.argv);
    const eventFile = String(args.events || "");
    if (!eventFile) {
        throw new Error("Usage: node scripts/analyze-costs.mjs --events <events.jsonl> [--include-failed true]");
    }

    const raw = await readFile(eventFile, "utf8");
    const events = parseJsonl(raw);
    const includeFailed = String(args["include-failed"] || "false") === "true";
    const defaultRate = {
        inputUsdPerMillion: Number(args["input-rate"] || 3),
        outputUsdPerMillion: Number(args["output-rate"] || 15),
        thinkingUsdPerMillion: Number(args["thinking-rate"] || 15)
    };

    let turns = 0;
    let totalCost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let thinkingTokens = 0;
    const byProvider = {};
    const byModel = {};

    for (const event of events) {
        if (event.type !== "turn_completed") continue;
        const status = String(event?.payload?.status || "");
        if (!includeFailed && status && status !== "success") continue;

        const usage = normalizeUsage(event?.payload?.usage);
        const cost = estimateCost(usage, defaultRate);
        const provider = typeof event?.payload?.provider === "string" ? event.payload.provider : "unknown";
        const model = typeof event?.payload?.model === "string" ? event.payload.model : "unknown";

        turns += 1;
        totalCost += cost;
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        thinkingTokens += usage.thinkingTokens;
        byProvider[provider] = (byProvider[provider] || 0) + cost;
        byModel[model] = (byModel[model] || 0) + cost;
    }

    const result = {
        turns,
        totals: {
            inputTokens,
            outputTokens,
            thinkingTokens,
            estimatedCostUsd: totalCost
        },
        byProvider,
        byModel,
        rate: defaultRate
    };
    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});

