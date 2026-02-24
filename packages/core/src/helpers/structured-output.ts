import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface ZodToolDefinition<T extends z.ZodType> {
    name: string;
    description: string;
    inputSchema: T;
    run: (input: z.infer<T>) => any | Promise<any>;
}

/**
 * Creates a standard ToolDefinition out of a Zod schema based definition.
 * Similar to Anthropic SDK's `betaZodTool`.
 */
export function zodTool<T extends z.ZodType>(def: ZodToolDefinition<T>) {
    return {
        name: def.name,
        description: def.description,
        parameters: zodToJsonSchema(def.inputSchema as any) as Record<string, any>,
        execute: async (args: string | Record<string, any>) => {
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
