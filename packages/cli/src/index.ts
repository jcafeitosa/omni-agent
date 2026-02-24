import { render } from 'ink';
import React from 'react';
import { App } from './ui/App.js';
import { GeminiProvider } from '@omni-agent/providers';
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
        .option('model', {
            type: 'string',
            description: 'The Gemini model to use',
            default: 'gemini-2.5-flash'
        })
        .help()
        .parse();

    const provider = new GeminiProvider({
        model: argv.model as string
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
