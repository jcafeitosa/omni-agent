import { HardwareRecommendation } from "./hardware-profile.js";

export interface HuggingFaceModelFile {
    rfilename: string;
    size?: number;
}

export interface HuggingFaceModelSummary {
    id: string;
    downloads?: number;
    likes?: number;
    tags?: string[];
    siblings?: HuggingFaceModelFile[];
}

export interface HuggingFaceRecommendedModel {
    repoId: string;
    file: string;
    score: number;
    quantization: string;
    estimatedParamsB?: number;
}

export interface HuggingFaceCatalogOptions {
    token?: string;
    endpoint?: string;
    limit?: number;
    search?: string;
}

export class HuggingFaceCatalog {
    private readonly token?: string;
    private readonly endpoint: string;
    private readonly limit: number;
    private readonly search: string;

    constructor(options: HuggingFaceCatalogOptions = {}) {
        this.token = options.token || process.env.HUGGINGFACE_TOKEN;
        this.endpoint = options.endpoint || "https://huggingface.co";
        this.limit = options.limit || 30;
        this.search = options.search || "GGUF";
    }

    public async listModels(): Promise<HuggingFaceModelSummary[]> {
        const url = new URL(`${this.endpoint}/api/models`);
        url.searchParams.set("search", this.search);
        url.searchParams.set("sort", "downloads");
        url.searchParams.set("direction", "-1");
        url.searchParams.set("limit", String(this.limit));
        url.searchParams.set("full", "true");

        const response = await fetch(url.toString(), {
            headers: {
                ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch models from Hugging Face: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as HuggingFaceModelSummary[];
        return data || [];
    }

    public async recommendModels(recommendation: HardwareRecommendation, topK: number = 10): Promise<HuggingFaceRecommendedModel[]> {
        const models = await this.listModels();
        const results: HuggingFaceRecommendedModel[] = [];

        for (const model of models) {
            const files = model.siblings || [];
            for (const file of files) {
                const lower = file.rfilename.toLowerCase();
                if (!lower.endsWith(".gguf")) continue;

                const quantization = extractQuantization(file.rfilename);
                const normalizedQuant = quantization.toLowerCase();
                if (!recommendation.preferredQuantizations.some((q) => normalizedQuant.includes(q.toLowerCase()))) {
                    continue;
                }

                const params = extractParamSizeB(model.id, file.rfilename);
                if (params && params > recommendation.maxModelParamsB) {
                    continue;
                }

                const score = computeScore(model, quantization, recommendation);
                results.push({
                    repoId: model.id,
                    file: file.rfilename,
                    score,
                    quantization,
                    estimatedParamsB: params
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    public buildFileDownloadUrl(repoId: string, file: string): string {
        const safeRepo = encodeURIComponent(repoId).replace(/%2F/g, "/");
        const safeFile = encodeURIComponent(file).replace(/%2F/g, "/");
        return `${this.endpoint}/${safeRepo}/resolve/main/${safeFile}?download=true`;
    }
}

function extractQuantization(filename: string): string {
    const lower = filename.toLowerCase();
    const match = lower.match(/q[0-9]_k_[ms]|q[0-9]_k|q8_0|f16/);
    return match ? match[0].toUpperCase() : "UNKNOWN";
}

function extractParamSizeB(...inputs: string[]): number | undefined {
    const joined = inputs.join(" ").toLowerCase();
    const match = joined.match(/(\d{1,3})\s?b/);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function computeScore(model: HuggingFaceModelSummary, quantization: string, recommendation: HardwareRecommendation): number {
    const downloads = model.downloads || 0;
    const likes = model.likes || 0;
    const quantIndex = recommendation.preferredQuantizations.findIndex((q) => quantization.includes(q.toUpperCase()));
    const quantBonus = quantIndex >= 0 ? (recommendation.preferredQuantizations.length - quantIndex) * 1000 : 0;

    return downloads + likes * 20 + quantBonus;
}
