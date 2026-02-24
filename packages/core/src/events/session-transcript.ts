import type { EventLogEntry } from "../state/event-log-store.js";
import type { AgentMessage } from "../types/messages.js";

export interface TranscriptEntry {
    ts?: number;
    kind: "message" | "tool_use" | "tool_result" | "status" | "turn";
    role?: string;
    text?: string;
    tool?: string;
    toolUseId?: string;
    isError?: boolean;
    provider?: string;
    model?: string;
}

export interface SessionLike {
    messages?: AgentMessage[];
}

function toMessageText(message: AgentMessage): string {
    if (typeof message.content === "string") return message.content;
    const textParts: string[] = [];
    for (const part of message.content || []) {
        if ((part as any)?.type === "text" && typeof (part as any).text === "string") {
            textParts.push((part as any).text);
        }
    }
    return textParts.join("\n");
}

export function transcriptFromMessages(messages: AgentMessage[]): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];
    for (const message of messages) {
        entries.push({
            kind: "message",
            role: message.role,
            text: toMessageText(message),
            toolUseId: message.toolCallId,
            tool: message.toolName,
            isError: message.isError
        });

        if (message.toolCalls && message.toolCalls.length > 0) {
            for (const call of message.toolCalls) {
                entries.push({
                    kind: "tool_use",
                    role: "assistant",
                    tool: call.name,
                    toolUseId: call.id,
                    text: JSON.stringify(call.args)
                });
            }
        }
    }
    return entries;
}

export function transcriptFromSession(session: SessionLike): TranscriptEntry[] {
    return transcriptFromMessages(session.messages || []);
}

export function transcriptFromEvents(events: EventLogEntry[]): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];
    for (const event of events) {
        const payload = event.payload || {};
        if (event.type === "assistant_text") {
            entries.push({
                ts: event.ts,
                kind: "message",
                role: "assistant",
                text: "[assistant_text emitted]",
                provider: typeof payload.provider === "string" ? payload.provider : undefined,
                model: typeof payload.model === "string" ? payload.model : undefined
            });
            continue;
        }
        if (event.type === "tool_use") {
            entries.push({
                ts: event.ts,
                kind: "tool_use",
                role: "assistant",
                tool: typeof payload.tool === "string" ? payload.tool : undefined,
                toolUseId: typeof payload.tool_use_id === "string" ? payload.tool_use_id : undefined
            });
            continue;
        }
        if (event.type === "tool_result") {
            entries.push({
                ts: event.ts,
                kind: "tool_result",
                role: "toolResult",
                tool: typeof payload.tool === "string" ? payload.tool : undefined,
                toolUseId: typeof payload.tool_use_id === "string" ? payload.tool_use_id : undefined,
                isError: payload.status === "error",
                text: typeof payload.error === "string" ? payload.error : undefined
            });
            continue;
        }
        if (event.type === "turn_completed") {
            entries.push({
                ts: event.ts,
                kind: "turn",
                text: typeof payload.status === "string" ? payload.status : "unknown",
                provider: typeof payload.provider === "string" ? payload.provider : undefined,
                model: typeof payload.model === "string" ? payload.model : undefined
            });
            continue;
        }
        entries.push({
            ts: event.ts,
            kind: "status",
            text: event.type
        });
    }
    return entries;
}

export function transcriptToMarkdown(entries: TranscriptEntry[]): string {
    const lines: string[] = ["# Session Transcript", ""];
    for (const entry of entries) {
        const tsPrefix = entry.ts ? `${new Date(entry.ts).toISOString()} ` : "";
        if (entry.kind === "message") {
            const role = entry.role || "unknown";
            lines.push(`- ${tsPrefix}[${role}] ${entry.text || ""}`.trimEnd());
            continue;
        }
        if (entry.kind === "tool_use") {
            lines.push(`- ${tsPrefix}[tool_use] ${entry.tool || "unknown"} id=${entry.toolUseId || "n/a"}`);
            continue;
        }
        if (entry.kind === "tool_result") {
            lines.push(
                `- ${tsPrefix}[tool_result] ${entry.tool || "unknown"} id=${entry.toolUseId || "n/a"} status=${entry.isError ? "error" : "success"}`
            );
            if (entry.text) lines.push(`  - ${entry.text}`);
            continue;
        }
        if (entry.kind === "turn") {
            lines.push(
                `- ${tsPrefix}[turn] status=${entry.text || "unknown"} provider=${entry.provider || "n/a"} model=${entry.model || "n/a"}`
            );
            continue;
        }
        lines.push(`- ${tsPrefix}[event] ${entry.text || ""}`.trimEnd());
    }
    return `${lines.join("\n")}\n`;
}

