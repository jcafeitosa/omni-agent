/**
 * Standardized Message Types
 * This abstracts away provider-specific formats (Anthropic/Gemini/OpenAI)
 * and creates a unified way to represent conversations.
 */

export type Role = "system" | "user" | "assistant" | "tool" | "toolResult";

export interface ToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
}

export type AgentMessage = Message & {
    text?: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    isSteering?: boolean;
    isFollowUp?: boolean;
    uuid?: string;
};

export interface ToolResult {
    toolCallId: string;
    content: string | object;
    isError?: boolean;
}

export interface TextPart {
    type: "text";
    text: string;
}

export interface ToolCallPart {
    type: "tool_call";
    toolCall: ToolCall;
}

export interface ToolResultPart {
    type: "tool_result";
    result: ToolResult;
}

export interface ImageUrlPart {
    type: "image_url";
    url: string; // Base64 or URL
    detail?: "auto" | "low" | "high";
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart | ImageUrlPart;

export interface Message {
    role: Role;
    content: string | MessagePart[];
}

export interface SDKError {
    code: string;
    message: string;
    source: "core" | "provider" | "tool" | "hook" | "permission" | "command";
    retryable?: boolean;
    details?: Record<string, any>;
}

/**
 * High-level SDK Events for the Query generator.
 * Aligned with Claude Agent SDK patterns.
 */
export type SDKEvent =
    | { type: 'text'; text: string; uuid: string }
    | { type: 'tool_use'; tool: string; input: any; tool_use_id: string; uuid: string }
    | { type: 'tool_result'; tool: string; result: any; tool_use_id: string; is_error?: boolean; error?: SDKError; uuid: string }
    | { type: 'task_notification'; subtype: 'task_started' | 'task_completed' | 'task_failed' | 'task_cancelled'; task_id: string; tool_use_id?: string; agent_name?: string; message?: string; uuid: string }
    | { type: 'status'; subtype: 'info' | 'progress' | 'warning' | 'error'; message: string; error?: SDKError; uuid: string }
    | { type: 'hook'; subtype: 'started' | 'progress' | 'response'; hook_name: string; event: string; uuid: string }
    | { type: 'result'; subtype: 'success' | 'error'; result: string; usage?: any; error?: SDKError; uuid: string };
