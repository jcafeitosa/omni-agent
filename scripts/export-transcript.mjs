#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith("--")) continue;
        const key = token.slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
        args[key] = value;
    }
    return args;
}

function asText(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .filter((part) => part && part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n");
}

function sessionToMarkdown(sessionJson) {
    const lines = ["# Session Transcript", ""];
    const messages = Array.isArray(sessionJson?.messages) ? sessionJson.messages : [];
    for (const message of messages) {
        const role = String(message?.role || "unknown");
        const text = asText(message?.content);
        lines.push(`- [${role}] ${text}`.trimEnd());

        if (Array.isArray(message?.toolCalls)) {
            for (const call of message.toolCalls) {
                lines.push(`- [tool_use] ${call?.name || "unknown"} id=${call?.id || "n/a"}`);
            }
        }
    }
    return `${lines.join("\n")}\n`;
}

async function main() {
    const args = parseArgs(process.argv);
    const input = String(args.input || "");
    const output = String(args.output || "");
    if (!input || !output) {
        throw new Error("Usage: node scripts/export-transcript.mjs --input <session.json> --output <transcript.md>");
    }
    const raw = await readFile(input, "utf8");
    const json = JSON.parse(raw);
    const markdown = sessionToMarkdown(json);
    await writeFile(output, markdown, "utf8");
    console.log(`Transcript written to ${output}`);
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});

