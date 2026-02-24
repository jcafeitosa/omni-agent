/**
 * Thrown by tools to indicate a failure that should return structured
 * data to the model instead of just a raw string message.
 * E.g., returning an image of an error screen alongside a text explanation.
 */
export class ToolError extends Error {
    content;
    /**
     * @param messageOrContent A simple string message OR an array of structured ContentBlocks (text/images).
     */
    constructor(messageOrContent) {
        super(typeof messageOrContent === "string" ? messageOrContent : "Structured Tool Error");
        this.name = "ToolError";
        if (typeof messageOrContent === "string") {
            this.content = [{ type: "text", text: messageOrContent }];
        }
        else {
            this.content = messageOrContent;
        }
        // Fix prototype chain for subclassing built-ins in TS
        Object.setPrototypeOf(this, ToolError.prototype);
    }
}
