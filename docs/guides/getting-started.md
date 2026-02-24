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

## 4. OAuth multi-account quickstart (optional)

List OAuth profiles:

```bash
node packages/cli/dist/index.js oauth profiles
```

Start PKCE login (prints authorization URL + state/code verifier):

```bash
node packages/cli/dist/index.js oauth login --provider codex --account work
```

List saved accounts:

```bash
node packages/cli/dist/index.js oauth accounts --provider codex
```

## 5. Run security review (optional)

```bash
node packages/cli/dist/index.js --provider openai
# inside interactive session:
# /security-review --base=origin/main --exclude=dist,node_modules
```

## 6. Release readiness check

```bash
npm run release:check
```
