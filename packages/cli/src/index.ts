import { render } from 'ink';
import React from 'react';
import { App } from './ui/App.js';
import {
    createDefaultProviderRegistry,
    createDefaultOAuthManager,
    getOAuthProfileById,
    ModelRouter,
    ProviderModelManager,
    RoutedProvider
} from '@omni-agent/providers';
import {
    readFileTool,
    writeFileTool,
    readManyFilesTool,
    globTool,
    editTool,
    ripGrepTool,
    webSearchTool,
    memoryTool,
    bashTool,
    askUserTool,
    browserTool
} from '@omni-agent/tools';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
    ConnectorDescriptor,
    ConnectorRegistry,
    ConnectorStrategy,
    createPluginScaffold,
    exportCostSummary,
    EventJsonlProcessor,
    PluginManager,
    PluginCatalogEntry,
    summarizeTurnCosts,
    TasksBoard,
    TaskBoardStatus,
    transcriptFromEvents,
    transcriptFromSession,
    transcriptToMarkdown,
    validatePluginStructure
} from "@omni-agent/core";

async function runInteractiveAgent(argv: any) {
    const primaryProvider = String(argv.provider);
    const primaryModel = argv.model ? String(argv.model) : undefined;
    const defaultModel = argv['default-model'] ? String(argv['default-model']) : undefined;
    const oauthAccountId = argv['oauth-account'] ? String(argv['oauth-account']) : undefined;
    const oauthStrategy = String(argv['oauth-strategy'] || 'round_robin') as any;
    const sessionFile = argv['session-file'] ? String(argv['session-file']) : undefined;
    const eventLogFile = argv['event-log-file'] ? String(argv['event-log-file']) : undefined;
    const fallbackProviders = String(argv['fallback-providers'] || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    const optionsByProvider: Record<string, any> = {
        [primaryProvider]: primaryModel ? { model: primaryModel } : {},
        ollama: primaryModel ? { model: primaryModel } : {},
        'llama-cpp': {
            model: primaryModel,
            modelDir: process.env.LLAMA_CPP_MODEL_DIR || './models',
            autoStartServer: false
        }
    };

    const registry = createDefaultProviderRegistry();
    const oauthManager = createDefaultOAuthManager();
    if (!registry.has(primaryProvider)) {
        throw new Error(`Unknown provider: ${primaryProvider}`);
    }
    const modelManager = new ProviderModelManager({
        registry,
        optionsByProvider,
        defaultCooldownMs: 120_000
    });
    const router = new ModelRouter({
        registry,
        modelManager,
        optionsByProvider,
        defaultCooldownMs: 120_000,
        oauthManager,
        oauthStrategy
    });

    const baseProvider = registry.create(primaryProvider, optionsByProvider[primaryProvider]);
    const provider = new RoutedProvider({
        baseProvider,
        router,
        name: `routed:${primaryProvider}`,
        requestDefaults: {
            provider: primaryProvider,
            model: primaryModel,
            defaultModel,
            preferOAuthModels: true,
            providerPriority: [primaryProvider, ...fallbackProviders],
            allowProviderFallback: true,
            refreshBeforeRoute: true,
            oauthAccountId,
            oauthStrategy
        }
    });

    const toolList = [
        readFileTool(),
        writeFileTool(),
        readManyFilesTool(),
        globTool(),
        editTool(),
        ripGrepTool(),
        webSearchTool(),
        memoryTool(),
        bashTool(),
        askUserTool()
    ];

    const tools = new Map(toolList.map(t => [t.name, t]));

    console.log(chalk.bold.green('\n--- OmniAgent Interactive CLI ---\n'));
    render(React.createElement(App, { provider, tools, sessionFile, eventLogFile }));
}

async function runOAuthCommand(args: any): Promise<void> {
    const manager = createDefaultOAuthManager();

    if (args.oauthCmd === "profiles") {
        const profiles = manager.listProfiles();
        for (const profile of profiles) {
            console.log(`${profile.id}\t${profile.displayName}\tflow=${profile.authFlow}`);
        }
        return;
    }

    if (args.oauthCmd === "accounts") {
        const providerId = String(args.provider || "");
        if (!providerId) throw new Error("--provider is required");
        const ids = await manager.listAccountIds(providerId);
        if (ids.length === 0) {
            console.log(`No accounts stored for provider ${providerId}`);
            return;
        }
        for (const id of ids) {
            const creds = await manager.loadAccountCredentials(providerId, id);
            const expires = creds?.expiresAt ? new Date(creds.expiresAt).toISOString() : "n/a";
            console.log(`${id}\texpires=${expires}`);
        }
        return;
    }

    if (args.oauthCmd === "delete-account") {
        const providerId = String(args.provider || "");
        const accountId = String(args.account || "");
        if (!providerId || !accountId) throw new Error("--provider and --account are required");
        const removed = await manager.deleteAccountCredentials(providerId, accountId);
        console.log(removed ? `Removed account ${accountId} from ${providerId}` : `Account not found: ${providerId}/${accountId}`);
        return;
    }

    if (args.oauthCmd === "login") {
        const providerId = String(args.provider || "");
        const accountId = String(args.account || "default");
        const flow = String(args.flow || "pkce");
        if (!providerId) throw new Error("--provider is required");
        const profile = getOAuthProfileById(providerId);
        if (!profile) throw new Error(`Unknown OAuth profile: ${providerId}`);

        if (flow === "device") {
            const started = await manager.startDeviceLogin(providerId);
            console.log(`device_code=${started.deviceCode}`);
            if (started.userCode) console.log(`user_code=${started.userCode}`);
            if (started.verificationUriComplete) {
                console.log(`verification_uri_complete=${started.verificationUriComplete}`);
            } else if (started.verificationUri) {
                console.log(`verification_uri=${started.verificationUri}`);
            }

            if (args.poll === false) {
                console.log("Polling disabled. Run login again with --poll to complete.");
                return;
            }

            const creds = await manager.pollAndCompleteDeviceLogin(providerId, started.deviceCode, {
                timeoutMs: Number(args.timeoutMs || 300000),
                intervalSeconds: Number(started.interval || 5)
            });
            if (accountId !== "default") {
                await manager.saveAccountCredentials(providerId, accountId, { ...creds, accountId });
            }
            console.log(`Login completed for ${providerId}/${accountId}`);
            return;
        }

        const started = manager.startPkceLogin(providerId);
        if (!args.code) {
            console.log(`authorization_url=${started.authorizationUrl}`);
            console.log(`state=${started.state}`);
            console.log(`code_verifier=${started.codeVerifier}`);
            console.log("Complete login by running this command again with --code and --state.");
            return;
        }

        const creds = await manager.completeAuthorizationCodeLogin(providerId, {
            code: String(args.code),
            codeVerifier: String(args.codeVerifier || started.codeVerifier),
            expectedState: String(args.expectedState || started.state),
            state: String(args.state || "")
        });
        if (accountId !== "default") {
            await manager.saveAccountCredentials(providerId, accountId, { ...creds, accountId });
        }
        console.log(`Login completed for ${providerId}/${accountId}`);
        return;
    }

    throw new Error(`Unknown oauth command: ${String(args.oauthCmd || "")}`);
}

async function runPluginsCommand(args: any): Promise<void> {
    const manager = createPluginManagerFromArgs(args);

    if (args.pluginCmd === "scaffold") {
        const name = String(args.name || "").trim();
        if (!name) throw new Error("--name is required");
        const capabilities = parseCsv(args.capabilities);
        const connectorCategories = parseCsv(args.connectorCategories || args["connector-categories"]);
        const pluginDir = await createPluginScaffold({
            rootDir: String(args.root || process.cwd()),
            name,
            description: args.description ? String(args.description) : undefined,
            version: args.pluginVersion ? String(args.pluginVersion) : "0.1.0",
            author: args.author ? String(args.author) : undefined,
            capabilities: capabilities.length ? capabilities : undefined,
            connectorCategories: connectorCategories.length ? connectorCategories : undefined
        });
        console.log(`Plugin scaffold created: ${pluginDir}`);
        return;
    }

    if (args.pluginCmd === "validate") {
        const pluginPath = String(args.path || "").trim();
        if (!pluginPath) throw new Error("--path is required");
        const result = await validatePluginStructure(pluginPath);
        if (result.ok) {
            console.log("Plugin validation OK");
            return;
        }
        console.log("Plugin validation failed:");
        for (const issue of result.issues) {
            console.log(`- ${issue.path}: ${issue.message}`);
        }
        process.exitCode = 1;
        return;
    }

    if (args.pluginCmd === "catalog-list") {
        const entries = await manager.listCatalog();
        if (entries.length === 0) {
            console.log("Plugin catalog is empty.");
            return;
        }
        for (const entry of entries) {
            const caps = entry.capabilities?.length ? ` caps=${entry.capabilities.join(",")}` : "";
            const author = entry.author ? ` author=${entry.author}` : "";
            console.log(`${entry.name}@${entry.version}\tid=${entry.id}\tsource=${entry.source.type}${author}${caps}`);
        }
        return;
    }

    if (args.pluginCmd === "catalog-add") {
        const id = String(args.id || "").trim();
        const name = String(args.name || "").trim();
        const version = String(args.pluginVersion || "").trim();
        if (!id || !name || !version) throw new Error("--id, --name and --plugin-version are required");

        const sourceType = String(args.sourceType || args["source-type"] || "").trim();
        let source: PluginCatalogEntry["source"];
        if (sourceType === "path") {
            const path = String(args.path || "").trim();
            if (!path) throw new Error("--path is required for --source-type path");
            source = { type: "path", path };
        } else if (sourceType === "git") {
            const repositoryUrl = String(args.repository || "").trim();
            if (!repositoryUrl) throw new Error("--repository is required for --source-type git");
            source = {
                type: "git",
                repositoryUrl,
                ref: args.ref ? String(args.ref) : undefined
            };
        } else {
            throw new Error("--source-type must be path or git");
        }

        await manager.upsertCatalogEntry({
            id,
            name,
            version,
            description: args.description ? String(args.description) : undefined,
            tags: parseCsv(args.tags),
            category: args.category ? String(args.category) : undefined,
            author: args.author ? String(args.author) : undefined,
            capabilities: parseCsv(args.capabilities),
            connectorCategories: parseCsv(args.connectorCategories || args["connector-categories"]),
            homepage: args.homepage ? String(args.homepage) : undefined,
            source
        });
        console.log(`Catalog entry upserted: ${id}`);
        return;
    }

    if (args.pluginCmd === "catalog-remove") {
        const id = String(args.id || "").trim();
        if (!id) throw new Error("--id is required");
        await manager.removeCatalogEntry(id);
        console.log(`Catalog entry removed: ${id}`);
        return;
    }

    if (args.pluginCmd === "catalog-install") {
        const name = String(args.name || "").trim();
        if (!name) throw new Error("--name is required");
        const installed = await manager.installFromCatalog(name, args.pluginVersion ? String(args.pluginVersion) : undefined);
        console.log(`Installed plugin: ${installed.name} source=${installed.installSource || "catalog"} version=${installed.installedVersion || "n/a"}`);
        return;
    }

    throw new Error(`Unknown plugins command: ${String(args.pluginCmd || "")}`);
}

function createPluginManagerFromArgs(args: any): PluginManager {
    return new PluginManager({
        pluginsDir: args.pluginsDir ? String(args.pluginsDir) : undefined,
        stateFile: args.pluginsState ? String(args.pluginsState) : undefined,
        catalogFile: args.pluginsCatalog ? String(args.pluginsCatalog) : undefined
    });
}

async function runTasksCommand(args: any): Promise<void> {
    const board = new TasksBoard({ filePath: String(args.file || "TASKS.md") });
    await board.load();

    if (args.tasksCmd === "list") {
        const status = args.status ? String(args.status) as TaskBoardStatus : undefined;
        const tasks = board.list(status);
        for (const task of tasks) {
            const tags = task.tags?.length ? ` tags=${task.tags.join(",")}` : "";
            console.log(`${task.id}\t${task.status}\t${task.title}${tags}`);
        }
        if (tasks.length === 0) {
            console.log("No tasks.");
        }
        return;
    }

    if (args.tasksCmd === "add") {
        const title = String(args.title || "").trim();
        if (!title) throw new Error("--title is required");
        const status = args.status ? String(args.status) as TaskBoardStatus : "todo";
        const created = board.add(title, {
            status,
            tags: parseCsv(args.tags)
        });
        await board.save();
        console.log(`Task added: ${created.id}`);
        return;
    }

    if (args.tasksCmd === "set") {
        const id = String(args.id || "").trim();
        const status = String(args.status || "").trim() as TaskBoardStatus;
        if (!id || !status) throw new Error("--id and --status are required");
        const updated = board.setStatus(id, status);
        if (!updated) {
            throw new Error(`Task not found: ${id}`);
        }
        await board.save();
        console.log(`Task updated: ${updated.id} => ${updated.status}`);
        return;
    }

    if (args.tasksCmd === "remove") {
        const id = String(args.id || "").trim();
        if (!id) throw new Error("--id is required");
        const removed = board.remove(id);
        await board.save();
        console.log(removed ? `Task removed: ${id}` : `Task not found: ${id}`);
        return;
    }

    if (args.tasksCmd === "stats") {
        const stats = board.stats();
        console.log(JSON.stringify(stats, null, 2));
        return;
    }

    throw new Error(`Unknown tasks command: ${String(args.tasksCmd || "")}`);
}

async function runConnectorsCommand(args: any): Promise<void> {
    const filePath = String(args.file || ".omniagent/connectors.json");
    const registry = await loadConnectorRegistry(filePath);

    if (args.connectorsCmd === "capabilities") {
        for (const capability of registry.listCapabilities()) {
            console.log(capability);
        }
        return;
    }

    if (args.connectorsCmd === "list") {
        const capability = args.capability ? String(args.capability) : undefined;
        const includeCoolingDown = Boolean(args.includeCoolingDown ?? args["include-cooling-down"]);
        const records = capability
            ? registry.listByCapability(capability, includeCoolingDown)
            : registry.listCapabilities().flatMap((cap) => registry.listByCapability(cap, includeCoolingDown));
        for (const item of records) {
            const stats = registry.getStats(item.id);
            console.log(`${item.id}\tcapability=${item.capability}\tprovider=${item.provider || "n/a"}\tenabled=${item.enabled !== false}\tfails=${stats?.failCount || 0}`);
        }
        if (records.length === 0) {
            console.log("No connectors.");
        }
        return;
    }

    if (args.connectorsCmd === "upsert") {
        const id = String(args.id || "").trim();
        const capability = String(args.capability || "").trim();
        if (!id || !capability) throw new Error("--id and --capability are required");
        const descriptor: ConnectorDescriptor = {
            id,
            capability,
            category: args.category ? String(args.category) : undefined,
            provider: args.provider ? String(args.provider) : undefined,
            endpoint: args.endpoint ? String(args.endpoint) : undefined,
            priority: args.priority !== undefined ? Number(args.priority) : undefined,
            enabled: args.enabled === undefined ? true : Boolean(args.enabled),
            tags: parseCsv(args.tags),
            costClass: args.cost ? String(args.cost) as any : undefined,
            latencyClass: args.latency ? String(args.latency) as any : undefined
        };
        registry.upsert(descriptor);
        await saveConnectorRegistry(filePath, registry);
        console.log(`Connector upserted: ${id}`);
        return;
    }

    if (args.connectorsCmd === "remove") {
        const id = String(args.id || "").trim();
        if (!id) throw new Error("--id is required");
        const removed = registry.remove(id);
        await saveConnectorRegistry(filePath, registry);
        console.log(removed ? `Connector removed: ${id}` : `Connector not found: ${id}`);
        return;
    }

    if (args.connectorsCmd === "resolve") {
        const capability = String(args.capability || "").trim();
        if (!capability) throw new Error("--capability is required");
        const strategy = (args.strategy ? String(args.strategy) : "priority") as ConnectorStrategy;
        const selected = registry.resolve(capability, {
            strategy,
            includeCoolingDown: Boolean(args.includeCoolingDown ?? args["include-cooling-down"])
        });
        if (!selected) {
            console.log("No connector resolved.");
            return;
        }
        const stats = registry.getStats(selected.id);
        console.log(JSON.stringify({ connector: selected, stats }, null, 2));
        await saveConnectorRegistry(filePath, registry);
        return;
    }

    if (args.connectorsCmd === "fail") {
        const id = String(args.id || "").trim();
        if (!id) throw new Error("--id is required");
        registry.reportFailure(id, {
            cooldownMs: Number(args.cooldownMs || args["cooldown-ms"] || 60_000),
            error: args.error ? String(args.error) : undefined
        });
        await saveConnectorRegistry(filePath, registry);
        console.log(`Failure registered: ${id}`);
        return;
    }

    if (args.connectorsCmd === "success") {
        const id = String(args.id || "").trim();
        if (!id) throw new Error("--id is required");
        registry.reportSuccess(id);
        await saveConnectorRegistry(filePath, registry);
        console.log(`Success registered: ${id}`);
        return;
    }

    throw new Error(`Unknown connectors command: ${String(args.connectorsCmd || "")}`);
}

async function runOpsCommand(args: any): Promise<void> {
    if (args.opsCmd === "cost-report") {
        const eventsPath = String(args.events || "").trim();
        if (!eventsPath) throw new Error("--events is required");

        const events = await EventJsonlProcessor.readFile(resolve(eventsPath));
        const summary = summarizeTurnCosts(events, {
            includeFailedTurns: Boolean(args.includeFailed ?? args["include-failed"]),
            defaultRate: {
                inputUsdPerMillion: Number(args.inputRate ?? args["input-rate"] ?? 3),
                outputUsdPerMillion: Number(args.outputRate ?? args["output-rate"] ?? 15),
                thinkingUsdPerMillion: Number(args.thinkingRate ?? args["thinking-rate"] ?? 15)
            }
        });
        console.log(JSON.stringify(summary, null, 2));
        return;
    }

    if (args.opsCmd === "export-analytics") {
        const eventsPath = String(args.events || "").trim();
        const outputPath = String(args.output || "").trim();
        if (!eventsPath || !outputPath) throw new Error("--events and --output are required");
        const format = String(args.format || "json");
        if (!["json", "jsonl", "csv"].includes(format)) {
            throw new Error("--format must be one of: json, jsonl, csv");
        }

        const events = await EventJsonlProcessor.readFile(resolve(eventsPath));
        const summary = summarizeTurnCosts(events, {
            includeFailedTurns: Boolean(args.includeFailed ?? args["include-failed"]),
            defaultRate: {
                inputUsdPerMillion: Number(args.inputRate ?? args["input-rate"] ?? 3),
                outputUsdPerMillion: Number(args.outputRate ?? args["output-rate"] ?? 15),
                thinkingUsdPerMillion: Number(args.thinkingRate ?? args["thinking-rate"] ?? 15)
            }
        });
        const outputResolved = resolve(outputPath);
        await exportCostSummary(summary, outputResolved, format as "json" | "jsonl" | "csv");
        console.log(`Analytics exported to ${outputResolved}`);
        return;
    }

    if (args.opsCmd === "export-transcript") {
        const inputPath = String(args.input || "").trim();
        const outputPath = String(args.output || "").trim();
        if (!inputPath || !outputPath) throw new Error("--input and --output are required");

        const raw = await readFile(resolve(inputPath), "utf8");
        const parsed = JSON.parse(raw) as any;
        const inputFormat = String(args.inputFormat ?? args["input-format"] ?? "session");
        const entries =
            inputFormat === "events"
                ? transcriptFromEvents(Array.isArray(parsed) ? parsed : EventJsonlProcessor.parse(raw))
                : transcriptFromSession(parsed);
        const markdown = transcriptToMarkdown(entries);

        const out = resolve(outputPath);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, markdown, "utf8");
        console.log(`Transcript written to ${out}`);
        return;
    }

    throw new Error(`Unknown ops command: ${String(args.opsCmd || "")}`);
}

function parseCsv(value: unknown): string[] {
    if (!value) return [];
    return Array.from(
        new Set(
            String(value)
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
        )
    );
}

async function loadConnectorRegistry(filePath: string): Promise<ConnectorRegistry> {
    const registry = new ConnectorRegistry();
    const resolved = resolve(filePath);
    try {
        const raw = await readFile(resolved, "utf8");
        const parsed = JSON.parse(raw) as any;
        if (typeof (registry as any).importState === "function") {
            (registry as any).importState(parsed);
        } else if (parsed?.entries && Array.isArray(parsed.entries)) {
            for (const entry of parsed.entries) {
                if (entry?.descriptor) {
                    registry.upsert(entry.descriptor);
                }
            }
        }
        return registry;
    } catch {
        return registry;
    }
}

async function saveConnectorRegistry(filePath: string, registry: ConnectorRegistry): Promise<void> {
    const resolved = resolve(filePath);
    await mkdir(dirname(resolved), { recursive: true });
    const payload =
        typeof (registry as any).exportState === "function"
            ? (registry as any).exportState()
            : {
                  version: 1,
                  entries: registry
                      .listCapabilities()
                      .flatMap((capability) => registry.listByCapability(capability, true))
                      .map((descriptor) => ({ descriptor, failCount: 0, successCount: 0 }))
              };
    await writeFile(resolved, JSON.stringify(payload, null, 2), "utf8");
}

async function main() {
    const parser = yargs(hideBin(process.argv))
        .option('provider', {
            type: 'string',
            description: 'Primary provider to use',
            default: 'gemini'
        })
        .option('model', {
            type: 'string',
            description: 'Primary model to use (optional). If omitted, router selects automatically.'
        })
        .option('default-model', {
            type: 'string',
            description: 'Default model preference used when --model is not specified.'
        })
        .option('fallback-providers', {
            type: 'string',
            description: 'Comma-separated provider fallback order (e.g. "openai,ollama")',
            default: ''
        })
        .option('oauth-account', {
            type: 'string',
            description: 'OAuth account id to force for OAuth-enabled providers'
        })
        .option('oauth-strategy', {
            type: 'string',
            choices: ['single', 'round_robin', 'least_recent', 'parallel', 'random'] as const,
            description: 'OAuth multi-account balancing strategy',
            default: 'round_robin'
        })
        .option('session-file', {
            type: 'string',
            description: 'Persist interactive session state to this JSON file'
        })
        .option('event-log-file', {
            type: 'string',
            description: 'Persist runtime events to this JSONL file'
        })
        .command(
            'oauth <oauthCmd>',
            'OAuth account management and login',
            (y) =>
                y
                    .positional('oauthCmd', {
                        type: 'string',
                        choices: ['profiles', 'accounts', 'login', 'delete-account'] as const
                    })
                    .option('provider', { type: 'string', description: 'OAuth profile id (codex|claude-code|cursor|gemini-cli)' })
                    .option('account', { type: 'string', description: 'Account id for multi-session storage', default: 'default' })
                    .option('flow', { type: 'string', choices: ['pkce', 'device'] as const, default: 'pkce' })
                    .option('code', { type: 'string', description: 'Authorization code for PKCE completion' })
                    .option('state', { type: 'string', description: 'Returned state from OAuth callback' })
                    .option('expectedState', { type: 'string', description: 'Expected state used when login started' })
                    .option('codeVerifier', { type: 'string', description: 'Code verifier used in PKCE flow' })
                    .option('poll', { type: 'boolean', default: true, description: 'Poll device flow token endpoint automatically' })
                    .option('timeoutMs', { type: 'number', default: 300000, description: 'Device flow polling timeout in ms' })
        )
        .command(
            "plugins <pluginCmd>",
            "Plugin scaffold and validation",
            (y) =>
                y
                    .positional("pluginCmd", {
                        type: "string",
                        choices: ["scaffold", "validate", "catalog-list", "catalog-add", "catalog-remove", "catalog-install"] as const
                    })
                    .option("name", { type: "string", description: "Plugin name (for scaffold)" })
                    .option("root", { type: "string", description: "Root directory to create plugin", default: process.cwd() })
                    .option("description", { type: "string", description: "Plugin description" })
                    .option("plugin-version", { type: "string", description: "Plugin version" })
                    .option("author", { type: "string", description: "Plugin author" })
                    .option("capabilities", { type: "string", description: "Comma-separated capabilities" })
                    .option("connector-categories", { type: "string", description: "Comma-separated connector categories" })
                    .option("path", { type: "string", description: "Plugin path (for validate)" })
                    .option("id", { type: "string", description: "Catalog entry id" })
                    .option("category", { type: "string", description: "Catalog category" })
                    .option("tags", { type: "string", description: "Comma-separated tags" })
                    .option("homepage", { type: "string", description: "Plugin homepage URL" })
                    .option("source-type", { type: "string", choices: ["path", "git"] as const, description: "Catalog source type" })
                    .option("repository", { type: "string", description: "Git repository URL for catalog source" })
                    .option("ref", { type: "string", description: "Git ref/branch/tag for catalog source" })
                    .option("plugins-dir", { type: "string", description: "Managed plugins directory override" })
                    .option("plugins-state", { type: "string", description: "Plugins state file override" })
                    .option("plugins-catalog", { type: "string", description: "Plugins catalog file override" })
        )
        .command(
            "tasks <tasksCmd>",
            "Manage TASKS.md operational backlog",
            (y) =>
                y
                    .positional("tasksCmd", { type: "string", choices: ["list", "add", "set", "remove", "stats"] as const })
                    .option("file", { type: "string", description: "TASKS file path", default: "TASKS.md" })
                    .option("id", { type: "string", description: "Task id" })
                    .option("title", { type: "string", description: "Task title (add)" })
                    .option("status", {
                        type: "string",
                        choices: ["todo", "in_progress", "blocked", "done"] as const,
                        description: "Task status"
                    })
                    .option("tags", { type: "string", description: "Comma-separated tags" })
        )
        .command(
            "connectors <connectorsCmd>",
            "Manage capability connectors",
            (y) =>
                y
                    .positional("connectorsCmd", { type: "string", choices: ["list", "upsert", "remove", "resolve", "fail", "success", "capabilities"] as const })
                    .option("file", { type: "string", description: "Connectors state file", default: ".omniagent/connectors.json" })
                    .option("id", { type: "string", description: "Connector id" })
                    .option("capability", { type: "string", description: "Capability key (e.g. crm.read)" })
                    .option("category", { type: "string", description: "Connector category" })
                    .option("provider", { type: "string", description: "Provider name" })
                    .option("endpoint", { type: "string", description: "Connector endpoint URL" })
                    .option("priority", { type: "number", description: "Priority (lower is preferred)" })
                    .option("enabled", { type: "boolean", description: "Enable connector" })
                    .option("tags", { type: "string", description: "Comma-separated tags" })
                    .option("cost", { type: "string", choices: ["low", "medium", "high"] as const })
                    .option("latency", { type: "string", choices: ["low", "medium", "high"] as const })
                    .option("strategy", { type: "string", choices: ["priority", "round_robin", "lowest_cost", "lowest_latency", "random"] as const })
                    .option("include-cooling-down", { type: "boolean", default: false })
                    .option("cooldown-ms", { type: "number", default: 60000 })
                    .option("error", { type: "string", description: "Error message when marking failure" })
        )
        .command(
            "ops <opsCmd>",
            "Operational utilities (cost report and transcript export)",
            (y) =>
                y
                    .positional("opsCmd", { type: "string", choices: ["cost-report", "export-transcript", "export-analytics"] as const })
                    .option("events", { type: "string", description: "Events JSONL path for cost-report" })
                    .option("include-failed", { type: "boolean", default: false, description: "Include failed turns in cost report" })
                    .option("input-rate", { type: "number", default: 3, description: "Input token USD per 1M" })
                    .option("output-rate", { type: "number", default: 15, description: "Output token USD per 1M" })
                    .option("thinking-rate", { type: "number", default: 15, description: "Thinking token USD per 1M" })
                    .option("format", { type: "string", choices: ["json", "jsonl", "csv"] as const, default: "json" })
                    .option("input", { type: "string", description: "Session JSON or events JSONL input file" })
                    .option("input-format", { type: "string", choices: ["session", "events"] as const, default: "session" })
                    .option("output", { type: "string", description: "Transcript markdown output file" })
        )
        .help()
        .strict(false);

    const argv = await parser.parse();
    const commandName = String((argv as any)._?.[0] || "");
    if (commandName === "oauth") {
        await runOAuthCommand(argv);
        return;
    }
    if (commandName === "plugins") {
        await runPluginsCommand(argv);
        return;
    }
    if (commandName === "tasks") {
        await runTasksCommand(argv);
        return;
    }
    if (commandName === "connectors") {
        await runConnectorsCommand(argv);
        return;
    }
    if (commandName === "ops") {
        await runOpsCommand(argv);
        return;
    }

    await runInteractiveAgent(argv);
}
main().catch(err => {
    console.error(chalk.red('\nFatal Error:'), err.message);
    process.exit(1);
});
