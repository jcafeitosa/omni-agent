import { readFileSync, readdirSync, lstatSync } from "fs";
import { join } from "path";
import { Provider } from "../index.js";
import { VectorStore, VectorDocument } from "./vector-store.js";
import { randomUUID } from "node:crypto";

/**
 * Indexer
 * Handles codebase crawling, chunking, and embedding generation.
 */
export class Indexer {
    private provider: Provider;
    private vectorStore: VectorStore;
    private ignoreDirs = [".git", "node_modules", "dist", ".gemini", "brain"];

    constructor(provider: Provider, vectorStore: VectorStore) {
        this.provider = provider;
        this.vectorStore = vectorStore;
    }

    /**
     * Index a directory recursively.
     */
    async indexDirectory(dirPath: string): Promise<number> {
        const files: string[] = [];
        this.crawl(dirPath, files);

        let totalChunks = 0;
        for (const filePath of files) {
            const content = readFileSync(filePath, "utf-8");
            const chunks = this.chunkContent(content);

            if (chunks.length === 0) continue;

            const embeddings = await this.provider.embedBatch(chunks);
            const docs: VectorDocument[] = chunks.map((chunk, i) => ({
                id: randomUUID(),
                content: chunk,
                vector: embeddings[i],
                metadata: {
                    filePath,
                    chunkIndex: i
                }
            }));

            await this.vectorStore.addDocuments(docs);
            totalChunks += docs.length;
        }

        return totalChunks;
    }

    private crawl(dir: string, fileList: string[]): void {
        const files = readdirSync(dir);
        for (const file of files) {
            if (this.ignoreDirs.includes(file)) continue;

            const fullPath = join(dir, file);
            if (lstatSync(fullPath).isDirectory()) {
                this.crawl(fullPath, fileList);
            } else if (this.isTextFile(file)) {
                fileList.push(fullPath);
            }
        }
    }

    private isTextFile(file: string): boolean {
        const ext = [".ts", ".tsx", ".js", ".jsx", ".md", ".json", ".txt", ".sh", ".py", ".rs", ".go"];
        return ext.some(e => file.endsWith(e));
    }

    private chunkContent(content: string, chunkSize: number = 1000): string[] {
        // Simple chunking by length for now. 
        // Future improvement: Semantic chunking by functions/classes.
        const chunks: string[] = [];
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(content.slice(i, i + chunkSize));
        }
        return chunks;
    }
}
