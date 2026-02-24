# Provider Compatibility Matrix

Status de compatibilidade funcional no `omni-agent`.

## Legenda

- sim: implementado
- parcial: implementado com limitacoes
- nao: nao implementado

## Matriz

| Provider | generateText | tool-calling | embedText | embedBatch | getModelLimits | Observacoes |
|---|---|---|---|---|---|
| AnthropicProvider | sim | sim | nao | nao | sim | depende de API key `ANTHROPIC_API_KEY` |
| OpenAIProvider | sim | sim | sim | sim | sim | default embedding model `text-embedding-3-small` |
| GeminiProvider | sim | sim | sim | sim | sim | usa Gemini REST API direta; functionResponse usa `toolName` |
| BedrockProvider | sim | sim | sim | sim | sim | embeddings via `InvokeModel` (Titan default) |
| AzureOpenAIProvider | sim | sim | parcial | parcial | sim | herda OpenAI; requer deployment/modelo de embedding valido |
| VertexProvider | sim | sim | sim | sim | sim | herda Gemini em modo Vertex |
| GroqProvider | sim | sim | parcial | parcial | sim | herda OpenAI, embeddings dependem de suporte endpoint |
| XAIProvider | sim | sim | parcial | parcial | sim | herda OpenAI, embeddings dependem de suporte endpoint |
| OpenRouterProvider | sim | sim | parcial | parcial | sim | herda OpenAI, embeddings dependem do modelo/rota |
| MistralProvider | sim | sim | parcial | parcial | sim | herda OpenAI-compatible |
| DeepSeekProvider | sim | sim | parcial | parcial | sim | herda OpenAI-compatible |
| CerebrasProvider | sim | sim | parcial | parcial | sim | herda OpenAI-compatible |
| OllamaProvider | sim | sim | parcial | parcial | sim | herda OpenAI-compatible, depende do servidor local |
| LlamaCppProvider | sim | sim | parcial | parcial | sim | gestao nativa de `.gguf` + start/stop `llama-server` + recomendacao Hugging Face por perfil de hardware |

## Proximos fechamentos de conformidade

1. padronizar retorno de erro estruturado no nivel de provider
2. criar testes de contrato provider com cenarios iguais entre vendors
3. separar explicitamente suporte a embeddings por provider/modelo em configuracao
