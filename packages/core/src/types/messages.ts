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

export interface DocumentPart {
    type: "document";
    document: {
        sourceType: "text" | "url" | "base64";
        mediaType?: string;
        data?: string;
        url?: string;
        text?: string;
        name?: string;
    };
}

export interface CitationPart {
    type: "citation";
    citation: {
        text: string;
        source?: string;
        startIndex?: number;
        endIndex?: number;
    };
}

export interface CodeExecutionPart {
    type: "code_execution";
    language?: string;
    code?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
}

export interface RequestUserInputQuestionOption {
    label: string;
    description: string;
}

export interface RequestUserInputQuestion {
    id: string;
    header: string;
    question: string;
    isOther?: boolean;
    isSecret?: boolean;
    options?: RequestUserInputQuestionOption[];
}

export interface RequestUserInputEventPayload {
    call_id: string;
    turn_id?: string;
    questions: RequestUserInputQuestion[];
}

export type PlanStepStatus = "pending" | "in_progress" | "completed";

export interface PlanUpdateStep {
    step: string;
    status: PlanStepStatus;
}

export interface PlanUpdatePayload {
    explanation?: string;
    plan: PlanUpdateStep[];
}

export type MessagePart =
    | TextPart
    | ToolCallPart
    | ToolResultPart
    | ImageUrlPart
    | DocumentPart
    | CitationPart
    | CodeExecutionPart;

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
    | { type: 'text'; text: string; request_id?: string; provider?: string; model?: string; uuid: string }
    | { type: 'tool_use'; tool: string; input: any; tool_use_id: string; uuid: string }
    | { type: 'tool_result'; tool: string; result: any; tool_use_id: string; is_error?: boolean; error?: SDKError; uuid: string }
    | { type: 'task_notification'; subtype: 'task_started' | 'task_completed' | 'task_failed' | 'task_cancelled'; task_id: string; tool_use_id?: string; agent_name?: string; message?: string; uuid: string }
    | { type: 'request_user_input'; payload: RequestUserInputEventPayload; uuid: string }
    | { type: 'plan_update'; payload: PlanUpdatePayload; uuid: string }
    | { type: 'status'; subtype: 'info' | 'progress' | 'warning' | 'error'; message: string; error?: SDKError; uuid: string }
    | { type: 'hook'; subtype: 'started' | 'progress' | 'response'; hook_name: string; event: string; uuid: string }
    | { type: 'result'; subtype: 'success' | 'error'; result: string; structured?: any; usage?: any; request_id?: string; provider?: string; model?: string; error?: SDKError; uuid: string };
