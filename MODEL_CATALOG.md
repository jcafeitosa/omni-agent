# Catalogo e Classificacao de Modelos

Este arquivo define como o `omni-agent` cataloga e classifica modelos de providers diferentes.

## Objetivo

- ter um contrato unico de limites entre vendors
- permitir fallback seguro quando o modelo nao estiver no catalogo
- suportar decisao de roteamento por classe de latencia/custo/raciocinio

## Contrato

Cada provider expoe:

- `getModelLimits(model?)` -> `ProviderModelLimits`

O pacote `@omni-agent/providers` expoe:

- `listModelCatalog(provider?)`
- `resolveModelLimits(provider, model, configuredMaxOutputTokens?)`

## Campos de classificacao

- `family`: familia logica do modelo
- `tier`: `flagship | balanced | fast | local | specialized`
- `latencyClass`: `low | medium | high`
- `costClass`: `low | medium | high`
- `reasoningClass`: `baseline | advanced`
- `modalities`: `text | image | audio | video | code`
- `supportsToolCalling`: suporte nativo a tools/function calls
- `supportsEmbeddings`: `true | false | provider-dependent`

## Entradas atuais do catalogo

| Provider | Modelo | Tier | Latencia | Custo | Raciocinio | Tool Calling | Embeddings |
|---|---|---|---|---|---|---|---|
| openai | gpt-4o | flagship | medium | high | advanced | sim | nao |
| openai | gpt-4o-mini | fast | low | low | baseline | sim | nao |
| anthropic | claude-3-5-sonnet* | flagship | medium | high | advanced | sim | nao |
| gemini | gemini-2.5-flash* | fast | low | medium | advanced | sim | sim |
| amazon-bedrock | anthropic.claude-3-5-sonnet* | flagship | medium | high | advanced | sim | sim |
| openai | text-embedding-3-small | specialized | low | low | baseline | nao | sim |
| gemini | text-embedding-004 | specialized | low | low | baseline | nao | sim |
| amazon-bedrock | amazon.titan-embed-text-v2:0 | specialized | low | low | baseline | nao | sim |
| llama-cpp | *.gguf (local) | local | medium | low | baseline | sim | provider-dependent |

`*` representa match por prefixo/padrao.

## Fallback para modelos nao mapeados

Quando nao existe entrada no catalogo:

- `source = "unknown"`
- limites retornam `null` (ou `configured` quando informado)
- classificacao retorna baseline conservadora

## Exemplo

```ts
import { OpenAIProvider, listModelCatalog } from "@omni-agent/providers";

const provider = new OpenAIProvider({ model: "gpt-4o" });
const limits = provider.getModelLimits();

const catalog = listModelCatalog("openai");
```
