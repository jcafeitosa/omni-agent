#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

function toCsv(summary) {
    const header = "ts,status,provider,model,input_tokens,output_tokens,thinking_tokens,estimated_cost_usd";
    const lines = summary.turns.map((turn) =>
        [
            turn.ts,
            turn.status,
            turn.provider,
            turn.model,
            turn.inputTokens,
            turn.outputTokens,
            turn.thinkingTokens,
            turn.estimatedCostUsd
        ].join(",")
    );
    return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

async function main() {
    const args = parseArgs(process.argv);
    const eventFile = String(args.events || "");
    const outputFile = String(args.output || "");
    const format = String(args.format || "json");
    if (!eventFile || !outputFile) {
        throw new Error("Usage: node scripts/export-analytics.mjs --events <events.jsonl> --output <out> [--format json|jsonl|csv]");
    }
    if (!["json", "jsonl", "csv"].includes(format)) {
        throw new Error("--format must be json, jsonl, or csv");
    }

    const raw = await readFile(resolve(eventFile), "utf8");
    const events = parseJsonl(raw);
    const includeFailed = String(args["include-failed"] || "false") === "true";
    const rate = {
        inputUsdPerMillion: Number(args["input-rate"] || 3),
        outputUsdPerMillion: Number(args["output-rate"] || 15),
        thinkingUsdPerMillion: Number(args["thinking-rate"] || 15)
    };

    const turns = [];
    for (const event of events) {
        if (event.type !== "turn_completed") continue;
        const status = String(event?.payload?.status || "");
        if (!includeFailed && status && status !== "success") continue;
        const usage = normalizeUsage(event?.payload?.usage);
        turns.push({
            ts: event.ts,
            status: status || "unknown",
            provider: String(event?.payload?.provider || "unknown"),
            model: String(event?.payload?.model || "unknown"),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            thinkingTokens: usage.thinkingTokens,
            estimatedCostUsd: estimateCost(usage, rate)
        });
    }

    const summary = {
        turns,
        totalTurns: turns.length,
        totalEstimatedCostUsd: turns.reduce((acc, t) => acc + t.estimatedCostUsd, 0)
    };

    let payload = "";
    if (format === "json") payload = `${JSON.stringify(summary, null, 2)}\n`;
    if (format === "jsonl") payload = `${turns.map((t) => JSON.stringify(t)).join("\n")}${turns.length ? "\n" : ""}`;
    if (format === "csv") payload = toCsv(summary);

    const out = resolve(outputFile);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, payload, "utf8");
    console.log(`Analytics exported to ${out}`);
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});

