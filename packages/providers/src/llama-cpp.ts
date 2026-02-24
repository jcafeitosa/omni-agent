import { ProviderModelLimits, ProviderResponse, AgentMessage, ToolDefinition } from "@omni-agent/core";
import { OpenAIProvider, OpenAIProviderOptions } from "./openai.js";
import { resolveModelLimits } from "./utils/model-limits.js";
import { LlamaCppProcessManager, LlamaServerOptions } from "./local-models/llama-process-manager.js";
import { HardwareProfile, getHardwareRecommendation, readHardwareSnapshot } from "./local-models/hardware-profile.js";
import { HuggingFaceCatalog, HuggingFaceRecommendedModel } from "./local-models/huggingface-catalog.js";
import { createWriteStream } from "fs";
import { Writable } from "stream";

export interface LlamaCppProviderOptions extends OpenAIProviderOptions, LlamaServerOptions {
    model?: string;
    autoStartServer?: boolean;
    fallbackToLocalScan?: boolean;
    hardwareProfile?: HardwareProfile;
    huggingFace?: {
        enabled?: boolean;
        token?: string;
        endpoint?: string;
        search?: string;
        limit?: number;
        autoSuggestOnMissingModel?: boolean;
    };
}

export class LlamaCppProvider extends OpenAIProvider {
    public name = "llama-cpp";
    private readonly manager: LlamaCppProcessManager;
    private readonly llamaOptions: LlamaCppProviderOptions;
    private readonly hfCatalog?: HuggingFaceCatalog;

    constructor(options: LlamaCppProviderOptions = {}) {
        const model = options.model || process.env.LLAMA_CPP_MODEL || "";
        const port = options.port || 8080;
        const host = options.host || "127.0.0.1";

        super({
            model,
            apiKey: options.apiKey || "llama.cpp",
            baseURL: options.baseURL || `http://${host}:${port}/v1`,
            maxOutputTokens: options.maxOutputTokens,
            oauthProfileId: options.oauthProfileId
        });

        this.llamaOptions = {
            autoStartServer: true,
            fallbackToLocalScan: true,
            ...options,
            model
        };

        this.manager = new LlamaCppProcessManager({
            serverPath: options.serverPath,
            modelDir: options.modelDir,
            host,
            port,
            contextSize: options.contextSize,
            gpuLayers: options.gpuLayers,
            threads: options.threads
        });

        if (options.huggingFace?.enabled || process.env.LLAMA_CPP_HF_ENABLED === "1") {
            this.hfCatalog = new HuggingFaceCatalog({
                token: options.huggingFace?.token || process.env.HUGGINGFACE_TOKEN,
                endpoint: options.huggingFace?.endpoint || process.env.HUGGINGFACE_ENDPOINT,
                search: options.huggingFace?.search || process.env.LLAMA_CPP_HF_SEARCH || "GGUF",
                limit: options.huggingFace?.limit || Number(process.env.LLAMA_CPP_HF_LIMIT || 30)
            });
        }
    }

    public async generateText(messages: AgentMessage[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
        const selectedModel = this.llamaOptions.model;
        if (!selectedModel) {
            throw new Error("No llama.cpp model selected. Set options.model or LLAMA_CPP_MODEL.");
        }

        if (this.llamaOptions.autoStartServer) {
            try {
                await this.manager.ensureStarted(selectedModel);
            } catch (error) {
                if (this.llamaOptions.huggingFace?.autoSuggestOnMissingModel !== false && this.hfCatalog) {
                    const suggestions = await this.recommendHuggingFaceModels();
                    if (suggestions.length > 0) {
                        const first = suggestions[0];
                        throw new Error(
                            `Local llama.cpp model not ready: ${selectedModel}. Suggested Hugging Face model for your hardware: ${first.repoId}/${first.file}`
                        );
                    }
                }
                throw error;
            }
        }

        return super.generateText(messages, tools);
    }

    public async listAvailableModels(): Promise<string[]> {
        const fromServer = await this.manager.listServerModels();
        if (fromServer.length > 0) return fromServer;

        if (this.llamaOptions.fallbackToLocalScan !== false) {
            const local = await this.manager.listLocalModels();
            return local.map((m) => m.id);
        }

        return this.llamaOptions.model ? [this.llamaOptions.model] : [];
    }

    public async listLocalModels(): Promise<Array<{ id: string; path: string; sizeBytes?: number; updatedAt?: number }>> {
        return this.manager.listLocalModels();
    }

    public getHardwareRecommendation() {
        const snapshot = readHardwareSnapshot();
        return getHardwareRecommendation(this.llamaOptions.hardwareProfile || "auto", snapshot);
    }

    public async recommendHuggingFaceModels(topK: number = 10): Promise<HuggingFaceRecommendedModel[]> {
        if (!this.hfCatalog) return [];
        const recommendation = this.getHardwareRecommendation();
        return this.hfCatalog.recommendModels(recommendation, topK);
    }

    public async selectModelForHardware(options: { preferLocal?: boolean; topK?: number } = {}): Promise<{
        selectedModel: string | null;
        source: "local" | "huggingface" | "none";
        suggestions?: HuggingFaceRecommendedModel[];
    }> {
        const local = await this.listLocalModels();
        const recommendation = this.getHardwareRecommendation();

        if (options.preferLocal !== false && local.length > 0) {
            const sortedLocal = local
                .map((m) => ({ model: m.id, params: extractParamSize(m.id), raw: m }))
                .filter((m) => !m.params || m.params <= recommendation.maxModelParamsB)
                .sort((a, b) => (b.raw.updatedAt || 0) - (a.raw.updatedAt || 0));

            if (sortedLocal.length > 0) {
                this.llamaOptions.model = sortedLocal[0].model;
                return { selectedModel: sortedLocal[0].model, source: "local" };
            }
        }

        const suggestions = await this.recommendHuggingFaceModels(options.topK || 10);
        if (suggestions.length > 0) {
            return {
                selectedModel: `${suggestions[0].repoId}/${suggestions[0].file}`,
                source: "huggingface",
                suggestions
            };
        }

        return { selectedModel: null, source: "none" };
    }

    public async downloadRecommendedModel(options: {
        recommendation?: HuggingFaceRecommendedModel;
        topK?: number;
        overwrite?: boolean;
        onProgress?: (progress: { receivedBytes: number; totalBytes?: number; percent?: number }) => void;
    } = {}): Promise<{ modelPath: string; recommendation: HuggingFaceRecommendedModel; downloaded: boolean }> {
        if (!this.hfCatalog) {
            throw new Error("Hugging Face catalog is not enabled for this provider.");
        }

        const recommendation = options.recommendation || (await this.recommendHuggingFaceModels(options.topK || 10))[0];
        if (!recommendation) {
            throw new Error("No Hugging Face GGUF recommendation available for current hardware profile.");
        }

        const fileName = recommendation.file.split("/").pop() || recommendation.file;
        await this.manager.ensureModelDir();

        const outputPath = this.manager.getModelOutputPath(fileName);
        if (!options.overwrite && await this.manager.modelExists(fileName)) {
            return {
                modelPath: outputPath,
                recommendation,
                downloaded: false
            };
        }

        const url = this.hfCatalog.buildFileDownloadUrl(recommendation.repoId, recommendation.file);
        const response = await fetch(url, {
            headers: {
                ...(this.llamaOptions.huggingFace?.token || process.env.HUGGINGFACE_TOKEN
                    ? { Authorization: `Bearer ${this.llamaOptions.huggingFace?.token || process.env.HUGGINGFACE_TOKEN}` }
                    : {})
            }
        });

        if (!response.ok || !response.body) {
            throw new Error(`Failed to download Hugging Face model: ${response.status} ${response.statusText}`);
        }

        const totalBytesHeader = response.headers.get("content-length");
        const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : undefined;

        if (options.onProgress && response.body) {
            const reader = response.body.getReader();
            const fileStream = createWriteStream(outputPath);
            let receivedBytes = 0;

            // Progressive write for progress callback support.
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;

                receivedBytes += value.byteLength;
                fileStream.write(Buffer.from(value));

                const percent = totalBytes ? Math.round((receivedBytes / totalBytes) * 1000) / 10 : undefined;
                options.onProgress({ receivedBytes, totalBytes, percent });
            }

            await new Promise<void>((resolve, reject) => {
                fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
            });
        } else {
            // Fast path without manual chunk loop.
            const webWritable = Writable.toWeb(createWriteStream(outputPath));
            await response.body.pipeTo(webWritable);
        }

        const modelId = fileName.replace(/\\.gguf$/i, "");
        this.llamaOptions.model = modelId;

        return {
            modelPath: outputPath,
            recommendation,
            downloaded: true
        };
    }

    public async startServer(model?: string): Promise<void> {
        const target = model || this.llamaOptions.model;
        if (!target) {
            throw new Error("No llama.cpp model selected to start server.");
        }

        this.llamaOptions.model = target;
        await this.manager.start(target);
    }

    public stopServer(): void {
        this.manager.stop();
    }

    public async serverHealthy(): Promise<boolean> {
        return this.manager.isHealthy();
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        const activeModel = model || this.llamaOptions.model || "llama-local";
        const base = resolveModelLimits("ollama", activeModel, this.llamaOptions.maxOutputTokens ?? null);

        return {
            ...base,
            provider: this.name,
            notes: `${base.notes || ""} Local llama.cpp runtime limits depend on server flags (-c, -ngl, quantization).`.trim()
        };
    }
}

function extractParamSize(modelId: string): number | undefined {
    const match = modelId.toLowerCase().match(/(\d{1,3})\s?b/);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
}
