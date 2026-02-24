import { z } from "zod";
import { ToolDefinition } from "@omni-agent/core";

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
            const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
            const url = new URL(`${baseUrl}/models/gemini-2.5-flash:generateContent`);
            url.searchParams.set("key", apiKey);

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: `Search the web for: ${query}` }] }],
                    tools: [{ googleSearch: {} }]
                })
            });

            const payload = (await response.json()) as any;
            if (!response.ok) {
                const message = payload?.error?.message || `Gemini web search request failed (${response.status})`;
                return `Error searching the web: ${message}`;
            }

            const text =
                payload?.candidates?.[0]?.content?.parts
                    ?.map((p: any) => p?.text || "")
                    .filter(Boolean)
                    .join("") || "No response received.";
            const groundingMetadata = payload?.candidates?.[0]?.groundingMetadata;

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
