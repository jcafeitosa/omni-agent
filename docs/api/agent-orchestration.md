# Agent Orchestration and Skills

## AgentManager (`@omni-agent/core`)

`AgentManager` carrega agentes Markdown de:

- `agents`
- `.claude/agents`
- `plugins/*/agents`
- `../*/plugins/*/agents` em repositórios irmãos (quando existir no workspace)

Compatibilidade de frontmatter com formatos comuns de CLIs de agentes:

- suporta chaves camelCase e kebab-case (`maxTurns`/`max-turns`, `maxCostUsd`/`max-cost-usd`, `permissionMode`/`permission-mode`, `allowedAgents`/`allowed-agents`, `disallowedTools`/`disallowed-tools`)
- `tools` aceita lista YAML ou string separada por vírgula
- nomes de tools em formato TitleCase/CLI (`Read`, `Write`, `Grep`, `Glob`, `LS`, etc.) são mapeados para ferramentas Omni equivalentes

Hierarquia de políticas gerenciadas:

- `managedPolicies` em `AgentManagerOptions` aceita bundles por tier (`builtin`, `workspace`, `user`, `admin`, `enterprise`)
- precedência determinística por tier com composição em `ManagedPolicyHierarchy`
- regras e prefix-rules de tiers superiores prevalecem sobre tiers inferiores

## AgentOrchestrator (`@omni-agent/core`)

`AgentOrchestrator` executa planos de tasks com:

- dependências (`dependsOn`)
- paralelismo controlado (`maxParallel`)
- execução em background (`background`)
- ciclo de vida de task (`pending`, `running`, `background`, `completed`, `failed`, `cancelled`)
- isolamento por worktree (`isolation: "worktree"`)
- execução cross-process (`externalCommand`)

Principais métodos:

- `runPlan(plan)`
- `startTask(task)`
- `getTask(taskId)`
- `listTasks()`
- `cancelTask(taskId)`
- `waitForBackground(taskId)`
- `setSharedState(key, value)` / `listSharedState()`

## subagent tool actions

`subagent` suporta:

- `action=run`: execução direta de subagente
- `action=plan`: executa `teamPlan`
- `action=start`: inicia task em background
- `action=status`: consulta status de task
- `action=list`: lista tasks
- `action=cancel`: cancela task
- `action=wait`: aguarda finalização de task background

Campos de task relevantes:

- `dependsOn`: dependência entre tasks
- `collaborationNote`: contexto adicional para handoff
- `externalCommand`: execução em processo externo
- `workingDirectory`: diretório de execução da task

## SkillManager (`@omni-agent/core`)

`SkillManager` descobre e carrega `SKILL.md` de:

- `.claude/skills`
- `skills`
- `plugins/**/skills`
- `../*/plugins/**/skills` em repositórios irmãos (quando existir no workspace)

Quando houver colisão de nome de skill entre plugins, o nome é desambiguado automaticamente com escopo (`nome@plugin`).

`AgentManager` injeta automaticamente o contexto de skills declaradas no frontmatter do agente (`skills: [...]`) no system prompt do agente.

## PluginManager (`@omni-agent/core`)

`PluginManager` suporta distribuição/runtime de plugins com catálogo local:

- `upsertCatalogEntry(entry)` / `removeCatalogEntry(id)` / `listCatalog()`
- `installFromCatalog(name, version?)` com seleção automática da versão mais recente
- fontes suportadas no catálogo: `path` e `git` (com `ref` opcional)
- metadados de instalação persistidos em state (`installedVersion`, `installSource`)
