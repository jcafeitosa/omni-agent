/**
 * Creates a standard ToolDefinition out of a JSON Schema definition.
 * Similar to Anthropic SDK's `betaTool`.
 */
export function jsonSchemaTool(def) {
    return {
        name: def.name,
        description: def.description,
        parameters: def.inputSchema,
        execute: async (args) => {
            let parsedArgs = args;
            if (typeof args === "string") {
                parsedArgs = JSON.parse(args);
            }
            // For JSON schema we simply pass the parsed args down
            // Typically the LLM already formatted them correctly, or an external validator could be injected
            return def.run(parsedArgs);
        }
    };
}
