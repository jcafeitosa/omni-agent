# Agent Orchestration and Skills

## AgentOrchestrator (`@omni-agent/core`)

`AgentOrchestrator` executa planos de tasks com:

- dependências (`dependsOn`)
- paralelismo controlado (`maxParallel`)
- execução em background (`background`)
- ciclo de vida de task (`pending`, `running`, `background`, `completed`, `failed`, `cancelled`)

Principais métodos:

- `runPlan(plan)`
- `startTask(task)`
- `getTask(taskId)`
- `listTasks()`
- `cancelTask(taskId)`
- `waitForBackground(taskId)`

## subagent tool actions

`subagent` suporta:

- `action=run`: execução direta de subagente
- `action=plan`: executa `teamPlan`
- `action=start`: inicia task em background
- `action=status`: consulta status de task
- `action=list`: lista tasks
- `action=cancel`: cancela task
- `action=wait`: aguarda finalização de task background

## SkillManager (`@omni-agent/core`)

`SkillManager` descobre e carrega `SKILL.md` de:

- `.claude/skills`
- `skills`
- `plugins/**/skills`

`AgentManager` injeta automaticamente o contexto de skills declaradas no frontmatter do agente (`skills: [...]`) no system prompt do agente.

