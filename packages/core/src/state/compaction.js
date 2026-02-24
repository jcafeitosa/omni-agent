/**
 * Basic heuristics for token estimation if a proper tokenizer (like tiktoken)
 * is not provided. Fast but less accurate.
 */
export function estimateTextTokens(text) {
    return Math.ceil(text.length / 4); // General rule of thumb for English
}
export function estimateMessageTokens(message, textEstimator = estimateTextTokens) {
    let tokens = 0;
    // Role header token penalty
    tokens += 4;
    if (typeof message.content === "string") {
        tokens += textEstimator(message.content);
    }
    else {
        for (const part of message.content) {
            if (part.type === "text") {
                tokens += textEstimator(part.text);
            }
            else if (part.type === "tool_call") {
                tokens += textEstimator(JSON.stringify(part.toolCall));
                tokens += 10; // Penalty for tool call structured formatting
            }
            else if (part.type === "tool_result") {
                tokens += textEstimator(typeof part.result.content === "string" ? part.result.content : JSON.stringify(part.result.content));
                tokens += 10;
            }
            else if (part.type === "image_url") {
                // High-res images for most models take ~85 to ~170 tokens, basic estimation
                tokens += 170;
            }
        }
    }
    return tokens;
}
/**
 * Compacts a list of messages to fit within a token limit.
 * Strategies:
 * 1. Remove oldest pairs of (User/Assistant) first.
 * 2. Never remove the first System prompt (if configured).
 * 3. Never orphan a ToolResult from its ToolCall.
 */
export function compactMessages(messages, settings, tokenEstimator = estimateTextTokens) {
    const targetTokens = Math.floor(settings.maxTokens * (settings.targetRatio || 0.8));
    let currentTokens = messages.reduce((acc, msg) => acc + estimateMessageTokens(msg, tokenEstimator), 0);
    if (currentTokens <= settings.maxTokens) {
        return {
            newTokenCount: currentTokens,
            removedMessagesCount: 0,
            compactedMessages: [...messages]
        };
    }
    // Very naive compaction for Phase 1:
    // Drop messages from the front until we are under the targetTokens budget.
    // We keep dropping as long as we are over target, and we try to drop in pairs
    // to avoid breaking tool call/result sync.
    let compacted = [...messages];
    let removedCount = 0;
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
        compacted.splice(keepIndex, dropCount);
        currentTokens -= droppedTokens;
        removedCount += dropCount;
    }
    return {
        newTokenCount: currentTokens,
        removedMessagesCount: removedCount,
        compactedMessages: compacted
    };
}
