# Getting Started

## 1. Install and Build

```bash
npm install
npm run build
```

## 2. Choose an execution mode

## Cloud-first (OpenAI / Anthropic / Gemini)

Set provider credentials:

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export GEMINI_API_KEY=...
```

Run CLI:

```bash
node packages/cli/dist/index.js --model gpt-4o
```

## Local-first (llama.cpp)

Prerequisites:

- `llama-server` installed and available in PATH
- `.gguf` models in your local model directory (default: `./models`)

Run with local provider in code:

```ts
import { LlamaCppProvider } from "@omni-agent/providers";

const provider = new LlamaCppProvider({
  model: "my-model",
  modelDir: "./models",
  autoStartServer: true
});
```

## Hybrid (cloud + local fallback)

Use `ProviderModelManager` for provider model refresh and cooldown control. Keep local and cloud providers registered so the runtime can route safely.

## 3. Validate repository state

```bash
npm run repo:validate
```

## 4. Release readiness check

```bash
npm run release:check
```
