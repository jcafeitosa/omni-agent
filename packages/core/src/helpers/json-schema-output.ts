export interface JsonSchemaToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, any>; // Raw JSON schema describing the tool parameters
    run: (input: Record<string, any>) => any | Promise<any>;
}

/**
 * Creates a standard ToolDefinition out of a JSON Schema definition.
 * Similar to Anthropic SDK's `betaTool`.
 */
export function jsonSchemaTool(def: JsonSchemaToolDefinition) {
    return {
        name: def.name,
        description: def.description,
        parameters: def.inputSchema,
        execute: async (args: string | Record<string, any>) => {
            let parsedArgs = args;
            if (typeof args === "string") {
                parsedArgs = JSON.parse(args);
            }

            // For JSON schema we simply pass the parsed args down
            // Typically the LLM already formatted them correctly, or an external validator could be injected
            return def.run(parsedArgs as Record<string, any>);
        }
    };
}
