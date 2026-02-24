import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { LlamaCppProvider } from "./llama-cpp.js";

type FetchType = typeof fetch;

function withMockFetch(mock: FetchType) {
    const original = globalThis.fetch;
    (globalThis as any).fetch = mock;
    return () => {
        (globalThis as any).fetch = original;
    };
}

test("llama-cpp recommends Hugging Face GGUF models based on hardware profile", async () => {
    const restore = withMockFetch((async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/models")) {
            return new Response(JSON.stringify([
                {
                    id: "org/model-7b-gguf",
                    downloads: 1000,
                    likes: 50,
                    siblings: [
                        { rfilename: "model-7b-Q4_K_M.gguf" }
                    ]
                },
                {
                    id: "org/model-14b-gguf",
                    downloads: 2000,
                    likes: 100,
                    siblings: [
                        { rfilename: "model-14b-Q4_K_M.gguf" }
                    ]
                }
            ]), { status: 200, headers: { "content-type": "application/json" } });
        }

        return new Response("not found", { status: 404 });
    }) as FetchType);

    try {
        const provider = new LlamaCppProvider({
            modelDir: path.join(os.tmpdir(), "omni-agent-llama-test-models"),
            hardwareProfile: "cpu-low",
            huggingFace: {
                enabled: true,
                endpoint: "https://mock.hf"
            }
        });

        const recommendations = await provider.recommendHuggingFaceModels(5);
        assert.ok(recommendations.length > 0);
        assert.equal(recommendations[0].repoId, "org/model-7b-gguf");
        assert.ok(recommendations.every((r) => (r.estimatedParamsB || 0) <= 8));
    } finally {
        restore();
    }
});

test("llama-cpp downloads recommended model to local model dir", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-agent-llama-download-"));

    const restore = withMockFetch((async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/resolve/main/")) {
            return new Response("GGUF_TEST_CONTENT", {
                status: 200,
                headers: { "content-length": "17" }
            });
        }
        return new Response("not found", { status: 404 });
    }) as FetchType);

    try {
        const provider = new LlamaCppProvider({
            modelDir: tmpDir,
            huggingFace: {
                enabled: true,
                endpoint: "https://mock.hf"
            }
        });

        const recommendation = {
            repoId: "org/model-7b-gguf",
            file: "model-7b-Q4_K_M.gguf",
            score: 123,
            quantization: "Q4_K_M",
            estimatedParamsB: 7
        };

        const first = await provider.downloadRecommendedModel({ recommendation });
        assert.equal(first.downloaded, true);
        const content = await fs.readFile(first.modelPath, "utf8");
        assert.equal(content, "GGUF_TEST_CONTENT");

        const second = await provider.downloadRecommendedModel({ recommendation });
        assert.equal(second.downloaded, false);
    } finally {
        restore();
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});
