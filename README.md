# Omni Agent

Biblioteca/monorepo para orquestracao e gerenciamento de agentes com foco em portabilidade entre plataformas e providers.

## Governanca do Repositorio

- Licenca: `MIT` ([LICENSE](./LICENSE))
- Como contribuir: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Codigo de conduta: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Politica de seguranca: [SECURITY.md](./SECURITY.md)
- Suporte: [SUPPORT.md](./SUPPORT.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Processo de release: [docs/release-process.md](./docs/release-process.md)
- Guia de mantenedores: [docs/maintainers-guide.md](./docs/maintainers-guide.md)
- Ownership de codigo: [.github/CODEOWNERS](./.github/CODEOWNERS)

## Releases e Packages

- Release automatizado via tag `v*.*.*` em [`.github/workflows/release.yml`](./.github/workflows/release.yml)
- Publicacao automatizada de pacotes via [`.github/workflows/packages.yml`](./.github/workflows/packages.yml)
- Segredo necessario para npm: `NPM_TOKEN`
- Publicacao em GitHub Packages exige scope igual ao owner do repositorio

## Guias e Exemplos

- Onboarding: [docs/guides/getting-started.md](./docs/guides/getting-started.md)
- Configuracao: [docs/guides/configuration.md](./docs/guides/configuration.md)
- Checklist de manutencao: [docs/guides/maintainer-checklist.md](./docs/guides/maintainer-checklist.md)
- API reference: [docs/api/README.md](./docs/api/README.md)
- Exemplo local llama.cpp: [examples/quickstart-local-llama.ts](./examples/quickstart-local-llama.ts)
- Exemplo hibrido com cooldown: [examples/quickstart-hybrid.ts](./examples/quickstart-hybrid.ts)

## Posicionamento

`omni-agent` e um projeto para sistema completo, nao MVP. O objetivo e entregar uma base de execucao de agentes pronta para producao, com:

- orquestracao de agentes e subagentes
- governanca de ferramentas e permissoes
- integracao multivendor de modelos
- exposicao por CLI e MCP
- observabilidade e evolucao controlada por criterios de qualidade

## Objetivo

`omni-agent` organiza os blocos necessarios para montar um agente executavel em qualquer ambiente:

- loop de agente com eventos, sessoes e controle de permissao
- provedor de modelo intercambiavel (Anthropic, OpenAI, Gemini, Bedrock e variantes OpenAI-compatible)
- conjunto de ferramentas de execucao (arquivos, shell, busca, git, browser, MCP)
- exposicao via CLI e via servidor MCP HTTP (`webmcp`)

## Estrutura do monorepo

- `packages/core`: loop principal, estado, comandos slash, seguranca/sandbox, delegacao de subagentes, indexacao semantica
- `packages/tools`: ferramentas utilitarias para leitura/escrita, shell, busca, git, browser e ponte MCP
- `packages/providers`: adaptadores para APIs de modelos
- `packages/cli`: interface TUI (Ink/React)
- `packages/webmcp`: servidor MCP Streamable HTTP para expor as tools
- `agents/`: definicoes de agentes em Markdown + frontmatter YAML
- `.omniagent/knowledge_base.json`: persistencia da base vetorial local

## Operacao (analytics)

- relatorio de custo por eventos: `npm run ops:cost-report -- --events ./logs/events.jsonl`
- export de transcricao de sessao: `npm run ops:export-transcript -- --input ./session.json --output ./transcript.md`
- export estruturado de analytics: `npm run ops:export-analytics -- --events ./logs/events.jsonl --output ./logs/costs.csv --format csv`
- persistencia automatica no CLI: `omni --session-file ./.omniagent/session.json --event-log-file ./.omniagent/events.jsonl`

## Funcionalidades implementadas

## 1) Loop e sessao

- `AgentLoop` com streaming de eventos (`text`, `tool_use`, `tool_result`, `status`, `result`, `hook`)
- controle de interrupcao (`interrupt`) e mudanca dinamica de modo de permissao
- tracking de uso/tokens/custo aproximado na `AgentSession`
- compactacao de contexto por estimativa de tokens (`compactMessages`)

## 2) Ferramentas integradas

- arquivos: `read_file`, `read_many_files`, `glob`, `write_file`, `edit`
- busca local: `rip_grep`
- memoria de projeto: `memory` (default em `GEMINI.md`)
- shell: `bash` (com truncamento inteligente de saida)
- web: `web_search` (Gemini + Google Search grounding)
- interacao: `ask_user`
- automacao browser: `browser` (Playwright)
- git: `git_status`, `git_diff`, `git_commit`
- MCP bridge: descoberta e chamada de tools de servidores MCP externos

## 3) Providers suportados

- nativos: `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`, `BedrockProvider`
- local nativo: `LlamaCppProvider` (modelos `.gguf` com `llama-server`)
- variantes: `AzureOpenAIProvider`, `VertexProvider`
- OpenAI-compatible: `Groq`, `XAI`, `OpenRouter`, `Mistral`, `DeepSeek`, `Cerebras`, `Ollama`

Observacao: embeddings estao implementados em OpenAI, Gemini e Bedrock. Para Anthropic Messages API, embeddings nao sao suportados nativamente e devem usar provider dedicado.

### Ollama local ou remoto

`OllamaProvider` suporta conexao local e remota:

Local (default):

```ts
import { OllamaProvider } from "@omni-agent/providers";

const provider = new OllamaProvider({
  connection: "local",
  host: "127.0.0.1",
  port: 11434,
  model: "llama3.1"
});
```

Remoto:

```ts
import { OllamaProvider } from "@omni-agent/providers";

const provider = new OllamaProvider({
  connection: "remote",
  protocol: "https",
  host: "ollama.example.com",
  port: 443,
  token: process.env.OLLAMA_API_KEY,
  model: "qwen2.5-coder:32b"
});
```

Tambem pode usar variaveis de ambiente:

- `OLLAMA_BASE_URL` (ex.: `https://ollama.example.com/v1`)
- `OLLAMA_CONNECTION` (`local` ou `remote`)
- `OLLAMA_PROTOCOL`, `OLLAMA_HOST`, `OLLAMA_PORT`
- `OLLAMA_API_KEY`

Todos os providers expostos em `@omni-agent/providers` implementam `getModelLimits(model?)`, que retorna:

- provider
- model
- contextWindowTokens
- maxOutputTokens
- maxInputTokens
- source (`catalog`, `configured`, `unknown`)
- notes

Exemplo:

```ts
const provider = new OpenAIProvider({ model: "gpt-4o" });
const limits = provider.getModelLimits();
// { provider, model, contextWindowTokens, maxOutputTokens, ... }
```

Abstracao universal para qualquer provider/modelo:

- `ProviderRegistry` em `@omni-agent/core`
- `createDefaultProviderRegistry` em `@omni-agent/providers`

Exemplo:

```ts
import { createDefaultProviderRegistry } from "@omni-agent/providers";

const registry = createDefaultProviderRegistry();
const providerName = registry.resolveProviderNameForModel("claude-3-5-sonnet-20241022");
const provider = registry.create(providerName || "anthropic");
```

Gerenciamento de modelos disponiveis e cooldown:

- `ModelAvailabilityManager` (`@omni-agent/core`)
- `ProviderModelManager` (`@omni-agent/providers`)
- refresh automatico por provider + controle de cooldown por falha de modelo

### llama.cpp + Hugging Face por perfil de hardware

`LlamaCppProvider` pode conectar ao Hugging Face para recomendar modelos GGUF de acordo com perfil de hardware (`auto`, `cpu-low`, `cpu-medium`, `cpu-high`, `gpu-low`, `gpu-high`):

```ts
import { LlamaCppProvider } from "@omni-agent/providers";

const provider = new LlamaCppProvider({
  modelDir: "./models",
  hardwareProfile: "auto",
  huggingFace: {
    enabled: true,
    token: process.env.HUGGINGFACE_TOKEN,
    autoSuggestOnMissingModel: true,
    search: "GGUF",
    limit: 30
  }
});

const selected = await provider.selectModelForHardware({ preferLocal: true });

// Opcional: baixar automaticamente o modelo recomendado para ./models
const dl = await provider.downloadRecommendedModel({
  onProgress: (p) => {
    if (p.percent !== undefined) console.log(`download: ${p.percent}%`);
  }
});
console.log(dl.modelPath);
```

Variaveis de ambiente uteis:

- `LLAMA_CPP_HF_ENABLED=1`
- `HUGGINGFACE_TOKEN`
- `HUGGINGFACE_ENDPOINT`
- `LLAMA_CPP_HF_SEARCH`
- `LLAMA_CPP_HF_LIMIT`

## 3.1) OAuth universal e identidade de CLI (base implementada)

O `@omni-agent/core` agora expoe uma camada de autenticacao comum:

- `OAuthManager`
- `OAuthCredentialStore` com modos `auto | file | keyring` (keyring via adapter)
- `OAuthProviderProfile` para padronizar endpoints, scopes, fluxo e identidade de cliente

O `@omni-agent/providers` inclui perfis base para:

- `codex`
- `claude-code`
- `cursor`
- `gemini-cli`

Observacao: esta entrega cobre a base arquitetural de auth. A execucao completa do login/refresh por provider (browser/device flow + token exchange) entra na sequencia dos itens `AUTH-001/002/003` do backlog.

## 4) Multiagente e extensibilidade

- `AgentManager` carrega agentes Markdown recursivamente
- suporte a restricao/allowlist de tools por agente (`tools`, `disallowedTools`)
- tools de delegacao: `delegate` e `parallel_delegate`
- hooks externos por evento via `hooks.json` (comandos Node/Python/Bash etc.)

## 4.1) Runtime de plugins e operacao de trabalho

- `PluginManager` com catalogo versionado e metadados de marketplace (`author`, `category`, `capabilities`, `connectorCategories`)
- `ConnectorRegistry` para resolver conectores por capability com estrategias (`priority`, `round_robin`, `lowest_cost`, `lowest_latency`, `random`) e cooldown por falha
- `MemoryStore` com duas camadas (`hot` e `deep`) incluindo promocao/rebaixamento (`promoteToHot`, `demoteToDeep`)
- `TasksBoard` para gerenciar `TASKS.md` (parse/list/add/update/status/save) como backlog operacional
- `createPluginScaffold` + `validatePluginStructure` para criar e validar plugins padronizados

## 5) Contexto semantico

- `Indexer` para varrer codigo e gerar embeddings por chunk
- `VectorStore` em memoria e `PersistentVectorStore` em disco
- `semantic_search` adicionada automaticamente no loop
- `ContextLoader` injeta `CLAUDE.md` (quando encontrado) como constituicao do projeto

## 5.1) Security review e triagem

- comando slash `/security-review` com analise de diff git
- parser JSON resiliente para output de modelo (`parseJsonWithFallbacks`)
- triagem por camadas com `FindingsFilter`:
  - exclusoes deterministicas (hard rules)
  - calibracao opcional por modelo com score de confianca
  - fail-open em erro de calibracao
- lock/reserva de execucao com `RunReservationManager` para evitar corrida de runs

## 6) Exposicao MCP HTTP

`@omni-agent/webmcp` oferece:

- `GET /health`
- `GET /tools`
- `GET /mcp` (SSE)
- `POST /mcp` (JSON-RPC 2.0; `initialize`, `ping`, `tools/list`, `tools/call`)

## Roadmap por dominios (sistema completo)

## Dominio A - Core de orquestracao

- consolidar fluxo de mensagens/tool_result para todos providers
- fechar padrao unico de eventos e contratos de erro
- estabilizar modo `plan` e politicas de permissao por ferramenta

## Dominio B - Runtime de ferramentas

- endurecer seguranca de shell/edit/fs (controles de path, limites, auditoria)
- padronizar resposta estruturada para todas as tools
- ampliar suite de testes de regressao por ferramenta

## Dominio C - Providers multivendor

- manter matriz de embeddings por provider atualizada (OpenAI/Gemini/Bedrock nativo; Anthropic via provider dedicado)
- normalizar comportamento de tool-calling entre APIs
- criar matriz de compatibilidade por modelo/provider

## Dominio D - Multiagente e governanca

- formalizar heranca de capacidades entre agentes
- adicionar politicas por agente (budget, max turns, allow/deny por tool)
- telemetria de delegacao e execucao paralela

## Dominio E - Conhecimento e recuperacao semantica

- melhorar chunking e estrategia de indexacao
- incluir metadados de versao e invalidez de indice
- validar qualidade de retrieval com cenarios reais

## Dominio F - Interfaces de execucao

- fortalecer UX da CLI para operacao longa
- maturar `webmcp` para cenarios multi-cliente
- publicar guia de integracao para clientes MCP externos

## Criterios de prontidao (Definition of Done)

Um dominio e considerado pronto quando todos os itens abaixo forem atendidos:

- contrato tecnico documentado e versionado
- testes automatizados cobrindo caminho feliz, erros e regressao
- observabilidade minima (logs, metrica de erro, pontos de auditoria)
- comportamento consistente entre Linux/macOS no que for aplicavel
- exemplos de uso atualizados e executaveis
- validacao de seguranca para caminhos de execucao com risco

## Execucao local

Pre-requisitos:

- Node.js 18+
- chaves de API conforme provider selecionado (ex.: `GEMINI_API_KEY`)

Instalacao e build:

```bash
npm install
npm run build
```

Rodar CLI (apos build):

```bash
node packages/cli/dist/index.js --model gemini-2.5-flash
```

Comandos operacionais da CLI:

```bash
# scaffolding e validacao de plugin
node packages/cli/dist/index.js plugins scaffold --name ops-assistant --root .
node packages/cli/dist/index.js plugins validate --path ./ops-assistant

# marketplace/catalogo de plugins
node packages/cli/dist/index.js plugins catalog-add --id ops-assistant@1.0.0 --name ops-assistant --plugin-version 1.0.0 --source-type path --path ./ops-assistant
node packages/cli/dist/index.js plugins catalog-list
node packages/cli/dist/index.js plugins catalog-install --name ops-assistant

# backlog TASKS.md
node packages/cli/dist/index.js tasks add --file TASKS.md --title "Implementar roteamento" --status in_progress
node packages/cli/dist/index.js tasks list --file TASKS.md

# conectores por capability
node packages/cli/dist/index.js connectors upsert --id crm-main --capability crm.read --provider remote-mcp --priority 10
node packages/cli/dist/index.js connectors resolve --capability crm.read --strategy priority
```

Rodar WebMCP (apos build):

```bash
node packages/webmcp/dist/cli.js --port 3333 --model gemini-2.5-flash
```

## Estado atual

- base arquitetural orientada a sistema completo de orquestracao de agentes
- README tecnico consolidado para alinhamento de produto e engenharia
- evolucao continua em cobertura de testes entre pacotes
- coexistencia de `*.js` e `*.ts` em `packages/core/src`, com padronizacao em andamento

## Arquivos de referencia

- `example.ts`: composicao basica de loop + provider + tool
- `agents/code-reviewer.md`: exemplo de manifesto de agente
- `hooks.json`: exemplo de hooks de lifecycle
- `PLANO_EXECUCAO_90_DIAS.md`: plano de entrega por fases e sprints
- `BACKLOG_EXECUCAO.md`: backlog operacional priorizado (P0/P1/P2)
- `PROVIDER_COMPAT_MATRIX.md`: matriz de compatibilidade funcional de providers
- `MODEL_CATALOG.md`: catalogo e classificacao de modelos por provider
- `ANTHROPIC_SDK_PARIDADE.md`: cobertura de recursos do anthropic-sdk-typescript
- `MAPEAMENTO_MULTI_REPOS_FUNCIONALIDADES.md`: consolidacao de funcionalidades/auth por repositorio e gap analysis para atualizacao do omni-agent
