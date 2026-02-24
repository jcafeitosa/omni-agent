import { AgentMessage } from "@omni-agent/core";

export interface MessageTransformOptions {
    normalizeToolCallId?: (id: string) => string;
    injectMissingToolResults?: boolean;
}

export function transformMessagesForProvider(
    messages: AgentMessage[],
    options: MessageTransformOptions = {}
): AgentMessage[] {
    const normalize = options.normalizeToolCallId;
    const idMap = new Map<string, string>();

    const remapped: AgentMessage[] = messages.map((message) => {
        if (message.role === "assistant" && message.toolCalls?.length) {
            const toolCalls = message.toolCalls.map((call) => {
                const originalId = String(call.id || "");
                const nextId = normalize ? normalize(originalId) : originalId;
                if (originalId && nextId && originalId !== nextId) {
                    idMap.set(originalId, nextId);
                }
                return {
                    ...call,
                    id: nextId || originalId
                };
            });
            return { ...message, toolCalls };
        }

        if (message.role === "toolResult" && message.toolCallId) {
            const nextId = idMap.get(message.toolCallId);
            if (nextId) {
                return { ...message, toolCallId: nextId };
            }
        }

        return message;
    });

    if (options.injectMissingToolResults === false) {
        return remapped;
    }

    return ensureToolResults(remapped);
}

function ensureToolResults(messages: AgentMessage[]): AgentMessage[] {
    const result: AgentMessage[] = [];
    let pending = new Map<string, { id: string; name: string }>();

    const flushPending = () => {
        if (pending.size === 0) return;
        for (const call of pending.values()) {
            result.push({
                role: "toolResult",
                toolCallId: call.id,
                toolName: call.name,
                text: "No result provided",
                isError: true,
                content: "No result provided"
            });
        }
        pending = new Map();
    };

    for (const message of messages) {
        if (message.role === "assistant") {
            flushPending();
            if (message.toolCalls?.length) {
                for (const call of message.toolCalls) {
                    pending.set(call.id, { id: call.id, name: call.name });
                }
            }
            result.push(message);
            continue;
        }

        if (message.role === "toolResult") {
            if (message.toolCallId) {
                pending.delete(message.toolCallId);
            }
            result.push(message);
            continue;
        }

        if (message.role === "user") {
            flushPending();
            result.push(message);
            continue;
        }

        result.push(message);
    }

    flushPending();
    return result;
}
