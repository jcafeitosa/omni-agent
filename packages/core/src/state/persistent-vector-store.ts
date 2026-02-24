import { VectorStore, VectorDocument } from "./vector-store.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * PersistentVectorStore
 * Extends the in-memory store with filesystem persistence using JSON.
 */
export class PersistentVectorStore implements VectorStore {
    private documents: VectorDocument[] = [];
    private filePath: string;

    constructor(storageDir: string = ".omniagent") {
        this.filePath = path.join(process.cwd(), storageDir, "knowledge_base.json");
    }

    async addDocuments(docs: VectorDocument[]): Promise<void> {
        this.documents.push(...docs);
        await this.save();
    }

    async search(queryVector: number[], limit: number): Promise<(VectorDocument & { score: number })[]> {
        const results = this.documents.map(doc => {
            const score = this.cosineSimilarity(queryVector, doc.vector);
            return { ...doc, score };
        });

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async clear(): Promise<void> {
        this.documents = [];
        await this.save();
    }

    /**
     * Loads the store from disk.
     */
    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.filePath, "utf-8");
            this.documents = JSON.parse(data);
        } catch (error: any) {
            if (error.code !== "ENOENT") {
                console.error("Failed to load vector store:", error.message);
            }
            this.documents = [];
        }
    }

    /**
     * Saves the store to disk.
     */
    async save(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            await fs.writeFile(this.filePath, JSON.stringify(this.documents, null, 2), "utf-8");
        } catch (error: any) {
            console.error("Failed to save vector store:", error.message);
        }
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
