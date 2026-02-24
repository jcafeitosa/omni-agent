# LlamaCppProvider

Source: `packages/providers/src/llama-cpp.ts`

## Capabilities

- Local model discovery (`.gguf`) from `modelDir`
- Optional auto-start of `llama-server`
- Hugging Face recommendation by hardware profile
- Optional automatic model download from Hugging Face

## Key methods

- `listLocalModels()`
- `listAvailableModels()`
- `selectModelForHardware()`
- `recommendHuggingFaceModels()`
- `downloadRecommendedModel()`
- `startServer()` / `stopServer()`
