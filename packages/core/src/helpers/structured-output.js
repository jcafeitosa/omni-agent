import { zodToJsonSchema } from "zod-to-json-schema";
/**
 * Creates a standard ToolDefinition out of a Zod schema based definition.
 * Similar to Anthropic SDK's `betaZodTool`.
 */
export function zodTool(def) {
    return {
        name: def.name,
        description: def.description,
        parameters: zodToJsonSchema(def.inputSchema),
        execute: async (args) => {
            let parsedArgs = args;
            if (typeof args === "string") {
                parsedArgs = JSON.parse(args);
            }
            // Validates against Zod schema and infers strictly typed args
            const validated = def.inputSchema.parse(parsedArgs);
            return def.run(validated);
        }
    };
}
