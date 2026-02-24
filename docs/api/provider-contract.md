# Provider Contract

Source: `packages/core/src/index.ts`

## Interface: `Provider`

Required methods:

- `generateText(messages, tools?, options?)`
- `embedText(text)`
- `embedBatch(texts)`
- `getModelLimits(model?)`

Optional methods:

- `getOAuthProfileId()`
- `listAvailableModels()`

## `ProviderModelLimits`

Standardized limits payload used by routing and safety decisions:

- provider/model identifiers
- context window and output/input token constraints
- source of limits (`catalog`, `configured`, `unknown`)
- model classification metadata
