export interface ContentBlock {
    type: "text" | "image";
    text?: string;
    source?: {
        type: "base64";
        media_type: string;
        data: string;
    };
}

export interface ToolErrorOptions {
    code?: string;
    retryable?: boolean;
    details?: Record<string, any>;
}

/**
 * Thrown by tools to indicate a failure that should return structured 
 * data to the model instead of just a raw string message. 
 * E.g., returning an image of an error screen alongside a text explanation.
 */
export class ToolError extends Error {
    public readonly content: ContentBlock[];
    public readonly code: string;
    public readonly retryable: boolean;
    public readonly details?: Record<string, any>;

    /**
     * @param messageOrContent A simple string message OR an array of structured ContentBlocks (text/images).
     */
    constructor(messageOrContent: string | ContentBlock[], options: ToolErrorOptions = {}) {
        super(typeof messageOrContent === "string" ? messageOrContent : "Structured Tool Error");
        this.name = "ToolError";
        this.code = options.code || "TOOL_EXECUTION_FAILED";
        this.retryable = options.retryable ?? false;
        this.details = options.details;

        if (typeof messageOrContent === "string") {
            this.content = [{ type: "text", text: messageOrContent }];
        } else {
            this.content = messageOrContent;
        }

        // Fix prototype chain for subclassing built-ins in TS
        Object.setPrototypeOf(this, ToolError.prototype);
    }
}
