import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { randomUUID } from "node:crypto";
import { Indexer } from "../state/indexer.js";

/**
 * Triggers codebase indexing for semantic search.
 */
export class IndexCommand implements SlashCommand {
    name = "index";
    description = "Index the current codebase for semantic search (RAG)";

    async *execute(context: CommandContext): CommandResponse {
        const loop = context.loop as any;
        const indexer = new Indexer(loop.provider, loop.vectorStore);

        yield {
            type: 'status',
            subtype: 'progress',
            message: 'Crawling and indexing codebase...',
            uuid: randomUUID()
        };

        try {
            const count = await indexer.indexDirectory(process.cwd());

            yield {
                type: 'text',
                text: `Successfully indexed codebase. Created ${count} semantic chunks.`,
                uuid: randomUUID()
            };

            yield {
                type: 'result',
                subtype: 'success',
                result: 'indexing complete',
                uuid: randomUUID()
            };
        } catch (e: any) {
            const message = `Indexing failed: ${e.message}`;
            yield {
                type: 'status',
                subtype: 'error',
                message,
                uuid: randomUUID()
            };
            yield {
                type: 'result',
                subtype: 'error',
                result: message,
                uuid: randomUUID()
            };
        }
    }
}
