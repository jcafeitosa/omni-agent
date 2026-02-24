export interface VectorMetadata {
    [key: string]: any;
}

export interface VectorDocument {
    id: string;
    vector: number[];
    content: string;
    metadata: VectorMetadata;
}

/**
 * VectorStore
 * Interface for semantic storage and search.
 */
export interface VectorStore {
    addDocuments(docs: VectorDocument[]): Promise<void>;
    search(queryVector: number[], limit: number): Promise<(VectorDocument & { score: number })[]>;
    clear(): Promise<void>;
}

/**
 * InMemoryVectorStore
 * A simple, high-performance in-memory vector store using cosine similarity.
 */
export class InMemoryVectorStore implements VectorStore {
    private documents: VectorDocument[] = [];

    async addDocuments(docs: VectorDocument[]): Promise<void> {
        this.documents.push(...docs);
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
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
