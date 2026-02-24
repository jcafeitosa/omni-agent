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

## Recursos do SDK ainda fora do fluxo principal do loop

- tool runner automatico integrado ao `AgentLoop` (hoje exposto via metodo do provider)
- parse output estruturado integrado ao pipeline principal do `AgentLoop`
- mcp helpers (`helpers/beta/mcp`) como utilitarios de alto nivel fora do provider
- memory helpers beta dedicados do SDK
- cobertura completa de blocos avancados (documentos, citacoes, code_execution blocks) no modelo interno de mensagens

## Direcao tecnica para fechar 100%

1. estender `AgentMessage` para blocos avancados (document/file/citations/code execution)
2. adicionar modo de execucao `toolRunner` no `AgentLoop` para providers que suportam auto-loop nativo
3. criar adaptadores utilitarios para MCP helper do SDK Anthropic no pacote `@omni-agent/tools` ou `@omni-agent/providers`
