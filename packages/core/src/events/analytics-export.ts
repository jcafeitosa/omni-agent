import * as fs from "node:fs/promises";
import { dirname } from "node:path";
import type { CostSummary, TurnCostRecord } from "./cost-analytics.js";

export type AnalyticsExportFormat = "json" | "jsonl" | "csv";

function escapeCsv(value: unknown): string {
    const raw = String(value ?? "");
    if (!raw.includes(",") && !raw.includes("\"") && !raw.includes("\n")) return raw;
    return `"${raw.replace(/"/g, "\"\"")}"`;
}

function turnToCsvLine(turn: TurnCostRecord): string {
    return [
        turn.ts,
        turn.status || "",
        turn.provider || "",
        turn.model || "",
        turn.usage.inputTokens,
        turn.usage.outputTokens,
        turn.usage.thinkingTokens || 0,
        turn.estimatedCostUsd,
        turn.pricingSource
    ]
        .map(escapeCsv)
        .join(",");
}

export function serializeCostSummary(summary: CostSummary, format: AnalyticsExportFormat): string {
    if (format === "json") {
        return `${JSON.stringify(summary, null, 2)}\n`;
    }
    if (format === "jsonl") {
        return summary.turns.map((turn) => JSON.stringify(turn)).join("\n") + (summary.turns.length ? "\n" : "");
    }

    const header = [
        "ts",
        "status",
        "provider",
        "model",
        "input_tokens",
        "output_tokens",
        "thinking_tokens",
        "estimated_cost_usd",
        "pricing_source"
    ].join(",");
    const lines = summary.turns.map(turnToCsvLine);
    return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

export async function exportCostSummary(
    summary: CostSummary,
    outputPath: string,
    format: AnalyticsExportFormat
): Promise<void> {
    await fs.mkdir(dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serializeCostSummary(summary, format), "utf8");
}

