import { Message, MessagePart } from "../types/messages.js";

/**
 * Basic heuristics for token estimation if a proper tokenizer (like tiktoken) 
 * is not provided. Fast but less accurate.
 */
export function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 4); // General rule of thumb for English
}

export function estimateMessageTokens(message: Message, textEstimator = estimateTextTokens): number {
    let tokens = 0;
    // Role header token penalty
    tokens += 4;

    if (typeof message.content === "string") {
        tokens += textEstimator(message.content);
    } else {
        for (const part of message.content) {
            if (part.type === "text") {
                tokens += textEstimator(part.text);
            } else if (part.type === "tool_call") {
                tokens += textEstimator(JSON.stringify(part.toolCall));
                tokens += 10; // Penalty for tool call structured formatting
            } else if (part.type === "tool_result") {
                tokens += textEstimator(typeof part.result.content === "string" ? part.result.content : JSON.stringify(part.result.content));
                tokens += 10;
            } else if (part.type === "image_url") {
                // High-res images for most models take ~85 to ~170 tokens, basic estimation
                tokens += 170;
            } else if (part.type === "document") {
                tokens += textEstimator(JSON.stringify(part.document));
                tokens += 20;
            } else if (part.type === "citation") {
                tokens += textEstimator(part.citation.text);
                tokens += 8;
            } else if (part.type === "code_execution") {
                tokens += textEstimator(`${part.language || ""}\n${part.code || ""}\n${part.stdout || ""}\n${part.stderr || ""}`);
                tokens += 16;
            }
        }
    }
    return tokens;
}

export interface CompactionSettings {
    maxTokens: number;
    targetRatio?: number; // Target ratio of maxTokens after compaction (e.g., 0.8)
    preserveSystemPrompt?: boolean;
    injectSummary?: boolean;
    summaryPrefix?: string;
}

export interface CompactionResult {
    newTokenCount: number;
    removedMessagesCount: number;
    removedMessages: Message[];
    compactedMessages: Message[];
}

/**
 * Compacts a list of messages to fit within a token limit.
 * Strategies:
 * 1. Remove oldest pairs of (User/Assistant) first.
 * 2. Never remove the first System prompt (if configured).
 * 3. Never orphan a ToolResult from its ToolCall.
 */
export function compactMessages(
    messages: Message[],
    settings: CompactionSettings,
    tokenEstimator = estimateTextTokens
): CompactionResult {
    const targetTokens = Math.floor(settings.maxTokens * (settings.targetRatio || 0.8));

    let currentTokens = messages.reduce((acc, msg) => acc + estimateMessageTokens(msg, tokenEstimator), 0);

    if (currentTokens <= settings.maxTokens) {
        return {
            newTokenCount: currentTokens,
            removedMessagesCount: 0,
            removedMessages: [],
            compactedMessages: [...messages]
        };
    }

    // Very naive compaction for Phase 1:
    // Drop messages from the front until we are under the targetTokens budget.
    // We keep dropping as long as we are over target, and we try to drop in pairs
    // to avoid breaking tool call/result sync.

    let compacted = [...messages];
    let removedCount = 0;
    const removedMessages: Message[] = [];
    let keepIndex = 0;

    // Protect system prompt at index 0 if needed
    if (settings.preserveSystemPrompt !== false && compacted.length > 0 && compacted[0].role === "system") {
        keepIndex = 1;
    }

    while (currentTokens > targetTokens && compacted.length > keepIndex + 1) {
        // Attempt to drop the next element(s)
        let dropCount = 1;
        let droppedTokens = estimateMessageTokens(compacted[keepIndex], tokenEstimator);

        // If we're dropping a tool call, we MUST drop its tool result too
        const msg = compacted[keepIndex];
        const isToolCall = Array.isArray(msg.content) && msg.content.some(p => p.type === "tool_call");

        if (isToolCall && compacted.length > keepIndex + 1) {
            // Look ahead for tool results
            if (compacted[keepIndex + 1] && compacted[keepIndex + 1].role === "tool") {
                dropCount++;
                droppedTokens += estimateMessageTokens(compacted[keepIndex + 1], tokenEstimator);
            }
        }

        // Remove elements
        const removed = compacted.splice(keepIndex, dropCount);
        removedMessages.push(...removed);
        currentTokens -= droppedTokens;
        removedCount += dropCount;
    }

    if (settings.injectSummary !== false && removedMessages.length > 0) {
        const summary = summarizeRemovedMessages(removedMessages, settings.summaryPrefix);
        compacted.unshift({
            role: "assistant",
            content: summary
        });
        currentTokens += estimateMessageTokens(compacted[0], tokenEstimator);
    }

    return {
        newTokenCount: currentTokens,
        removedMessagesCount: removedCount,
        removedMessages,
        compactedMessages: compacted
    };
}

export function summarizeRemovedMessages(messages: Message[], summaryPrefix = "Compaction summary"): string {
    const snippets: string[] = [];
    for (const msg of messages.slice(-24)) {
        const role = msg.role;
        let text = "";
        if (typeof msg.content === "string") {
            text = msg.content;
        } else {
            text = msg.content
                .map((part) => {
                    if (part.type === "text") return part.text;
                    if (part.type === "tool_call") return `[tool_call:${part.toolCall.name}]`;
                    if (part.type === "tool_result") return `[tool_result]`;
                    if (part.type === "image_url") return "[image]";
                    if (part.type === "document") return `[document:${part.document.name || "unnamed"}]`;
                    if (part.type === "citation") return `[citation:${part.citation.source || "unknown"}]`;
                    if (part.type === "code_execution") return `[code_execution:${part.language || "unknown"}]`;
                    return "";
                })
                .filter(Boolean)
                .join(" ");
        }
        if (!text) continue;
        snippets.push(`- ${role}: ${text.slice(0, 220)}`);
    }

    const body = snippets.length > 0 ? snippets.join("\n") : "- No textual content available.";
    return `${summaryPrefix}\n${body}`;
}
