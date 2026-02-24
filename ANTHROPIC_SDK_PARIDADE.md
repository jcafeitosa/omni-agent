# Paridade Anthropic SDK -> Omni Agent

## Escopo analisado

Base: `anthropic-sdk-typescript/src`

## Cobertura implementada no `AnthropicProvider`

- Messages API (`create`) com suporte a parametros avancados relevantes:
  - `system`, `metadata`, `thinking`, `tool_choice`, `mcp_servers`, `stop_sequences`, `top_k`, `top_p`
- Streaming raw SSE:
  - `streamRawMessages(...)`
- Streaming com helpers:
  - `streamWithHelpers(...)`
- Parse helper:
  - `parseMessage(...)` (via `messages.parse` quando disponivel na versao do SDK)
- Token counting:
  - `countTokens(...)`
- Message Batches:
  - `createMessageBatch`, `retrieveMessageBatch`, `listMessageBatches`, `cancelMessageBatch`, `deleteMessageBatch`, `streamMessageBatchResults`
- Models API:
  - `retrieveModel`, `listModels`
- Beta files API:
  - `betaUploadFile`, `betaListFiles`, `betaRetrieveFileMetadata`, `betaDownloadFile`, `betaDeleteFile`
- Beta tool runner:
  - `betaToolRunner(...)`
- Beta messages create:
  - `betaCreateMessage(...)`
- Multimodal input basico em mensagens:
  - suporte a `image_url` em formato data URL base64 no mapeamento de mensagens
- `ToolRunner` no core com controles avancados:
  - `maxIterations` (protege contra loops infinitos de tool-calling)
  - `withResponse(...)` retornando metadados (`requestId`, `provider`, `model`, `usage`)
  - suporte a cancelamento via `AbortSignal`
  - `toolRunnerMode=provider_native` no `AgentLoop` com fallback seguro para fluxo padrao
- Structured output no pipeline principal do loop:
  - parser universal de JSON (texto bruto, fenced code block e extracao por braces)
  - validacao opcional com Zod no `AgentLoop`
  - retorno de payload estruturado em evento final (`result.structured`)
  - modo estrito com erro terminal configuravel (`failOnValidationError`)
- MCP helpers de alto nivel no pacote de tools:
  - `McpServerManager` com `listResources`, `listPrompts`, `readResource`, `getPrompt`
  - facade `McpHelpers` para descoberta/leitura sem acoplamento ao provider
- Memory helpers no core:
  - `MemoryStore` (in-memory + persistencia em arquivo)
  - operacoes `remember`, `recall`, `search`, `list`, `forget`, `compactExpired`
- Blocos avancados no modelo interno de mensagens:
  - `document`, `citation`, `code_execution` adicionados em `MessagePart`
  - compaction e sumarizacao atualizadas para esses blocos
  - mapeamento de entrada no provider para preservar semantica quando possivel

## Recursos do SDK ainda fora do fluxo principal do loop

- sem gaps tecnicos bloqueantes no escopo mapeado para o provider e core.
- observacao: operacoes de release/publicacao dependem de configuracao externa de repositorio/registry.
