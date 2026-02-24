import { z } from "zod";
import { ToolDefinition, Provider } from "../index.js";
import { VectorStore, VectorDocument } from "../state/vector-store.js";

/**
 * Creates a tool for semantic search over the indexed codebase.
 */
export function semanticSearchTool(provider: Provider, vectorStore: VectorStore): ToolDefinition {
    return {
        name: "semantic_search",
        description: "Search the codebase for relevant snippets using natural language semantic similarity.",
        parameters: z.object({
            query: z.string().describe("The natural language search query"),
            limit: z.number().optional().default(5).describe("Number of relevant snippets to return")
        }),
        execute: async ({ query, limit }) => {
            try {
                const vector = await provider.embedText(query);
                const results = await vectorStore.search(vector, limit);

                if (results.length === 0) {
                    return "No relevant code snippets found. Try building the index with /index if you haven't yet.";
                }

                return results.map((res: VectorDocument & { score: number }) => (
                    `--- File: ${res.metadata.filePath} (Score: ${res.score.toFixed(3)}) ---\n${res.content}`
                )).join("\n\n");
            } catch (e: any) {
                return `Error performing semantic search: ${e.message}`;
            }
        }
    };
}
