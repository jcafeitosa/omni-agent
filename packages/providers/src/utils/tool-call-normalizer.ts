import { randomUUID } from "node:crypto";

export interface NormalizedToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
}

function toRecord(value: unknown): Record<string, any> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, any>;
    }
    return {};
}

export function parseJsonObjectArgs(raw: string | undefined | null): Record<string, any> {
    if (!raw || !raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        return toRecord(parsed);
    } catch {
        return {};
    }
}

export function normalizeToolCall(input: {
    id?: string;
    name?: string;
    args?: unknown;
}): NormalizedToolCall {
    return {
        id: input.id || randomUUID(),
        name: input.name || "unknown_tool",
        args: toRecord(input.args)
    };
}

