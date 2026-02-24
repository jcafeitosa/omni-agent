import { render } from 'ink';
import React from 'react';
import { App } from './ui/App.js';
import {
    createDefaultProviderRegistry,
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

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('provider', {
            type: 'string',
            description: 'Primary provider to use',
            default: 'gemini'
        })
        .option('model', {
            type: 'string',
            description: 'Primary model to use',
            default: 'gemini-2.5-flash'
        })
        .option('fallback-providers', {
            type: 'string',
            description: 'Comma-separated provider fallback order (e.g. "openai,ollama")',
            default: ''
        })
        .help()
        .parse();

    const primaryProvider = String(argv.provider);
    const primaryModel = String(argv.model);
    const fallbackProviders = String(argv['fallback-providers'] || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    const optionsByProvider: Record<string, any> = {
        [primaryProvider]: { model: primaryModel },
        ollama: { model: primaryModel },
        'llama-cpp': {
            model: primaryModel,
            modelDir: process.env.LLAMA_CPP_MODEL_DIR || './models',
            autoStartServer: false
        }
    };

    const registry = createDefaultProviderRegistry();
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
        defaultCooldownMs: 120_000
    });

    const baseProvider = registry.create(primaryProvider, optionsByProvider[primaryProvider]);
    const provider = new RoutedProvider({
        baseProvider,
        router,
        name: `routed:${primaryProvider}`,
        requestDefaults: {
            provider: primaryProvider,
            model: primaryModel,
            providerPriority: [primaryProvider, ...fallbackProviders],
            allowProviderFallback: fallbackProviders.length > 0,
            refreshBeforeRoute: true
        }
    });

    // Register all the ported tools
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

    render(React.createElement(App, { provider, tools }));
}

import chalk from 'chalk';
main().catch(err => {
    console.error(chalk.red('\nFatal Error:'), err.message);
    process.exit(1);
});
