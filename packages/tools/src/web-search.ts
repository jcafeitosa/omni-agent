import { z } from "zod";
import { ToolDefinition } from "@omni-agent/core";
import { GoogleGenAI } from "@google/genai";

export const webSearchTool = (options?: { apiKey?: string; }): ToolDefinition => ({
    name: "web_search",
    description: "Searches the web for information using Google Search via the Gemini API.",
    parameters: z.object({
        query: z.string().describe("The search query.")
    }),
    execute: async ({ query }) => {
        try {
            const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return "Error: GEMINI_API_KEY is required to use web search.";
            }

            const client = new GoogleGenAI({ apiKey });

            const response = await client.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: `Search the web for: ${query}` }] }],
                config: {
                    tools: [{ googleSearch: {} }] // Enable Grounding with Google Search
                }
            });

            const text = response.text || "No response received.";
            const groundingMetadata = (response.candidates?.[0] as any)?.groundingMetadata;

            let finalResponse = text;
            if (groundingMetadata?.groundingChunks) {
                const chunks = groundingMetadata.groundingChunks;
                finalResponse += "\n\nSources:\n";
                chunks.forEach((chunk: any, index: number) => {
                    const title = chunk.web?.title || "Untitled";
                    const uri = chunk.web?.uri || "No URI";
                    finalResponse += `[${index + 1}] ${title} (${uri})\n`;
                });
            }

            return `Web Search Results for "${query}":\n\n${finalResponse}`;
        } catch (error: any) {
            return `Error searching the web: ${error.message}`;
        }
    }
});
