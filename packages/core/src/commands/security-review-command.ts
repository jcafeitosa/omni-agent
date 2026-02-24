import { randomUUID } from "node:crypto";
import { CommandContext, CommandResponse, SlashCommand } from "./command-registry.js";
import { runSecurityReview } from "../security/security-review.js";

function parseArgs(args: string[]): {
    excludeDirs: string[];
    noModelFilter: boolean;
    baseRef?: string;
} {
    const excludeDirs: string[] = [];
    let noModelFilter = false;
    let baseRef: string | undefined;

    for (const arg of args) {
        if (arg === "--no-model-filter") {
            noModelFilter = true;
            continue;
        }
        if (arg.startsWith("--exclude=")) {
            const value = arg.slice("--exclude=".length);
            excludeDirs.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
            continue;
        }
        if (arg.startsWith("--base=")) {
            baseRef = arg.slice("--base=".length).trim() || undefined;
            continue;
        }
    }

    return { excludeDirs, noModelFilter, baseRef };
}

export class SecurityReviewCommand implements SlashCommand {
    name = "security-review";
    description = "Run AI security review on git diff with finding triage and confidence filtering";

    async *execute(context: CommandContext): CommandResponse {
        const loop = context.loop as any;
        const { excludeDirs, noModelFilter, baseRef } = parseArgs(context.args);

        yield {
            type: "status",
            subtype: "progress",
            message: "Running security review...",
            uuid: randomUUID()
        };

        try {
            const result = await runSecurityReview({
                provider: loop.provider,
                workingDirectory: loop.workingDirectory || process.cwd(),
                baseRef,
                excludedDirectories: excludeDirs,
                filterOptions: {
                    useModelFiltering: !noModelFilter
                }
            });

            const summary = [
                `Security review completed.`,
                `- findings_kept=${result.findings.length}`,
                `- findings_excluded=${result.excludedFindings.length}`,
                `- high_severity=${result.highSeverityCount}`,
                `- prompt_chars=${result.promptLength}`
            ].join("\n");

            yield {
                type: "text",
                text: summary,
                uuid: randomUUID()
            };

            if (result.highSeverityCount > 0) {
                yield {
                    type: "result",
                    subtype: "error",
                    result: `Security review found ${result.highSeverityCount} HIGH severity issue(s).`,
                    uuid: randomUUID()
                };
                return;
            }

            yield {
                type: "result",
                subtype: "success",
                result: "security review passed",
                uuid: randomUUID()
            };
        } catch (error: any) {
            const message = `Security review failed: ${error?.message || String(error)}`;
            yield {
                type: "status",
                subtype: "error",
                message,
                uuid: randomUUID()
            };
            yield {
                type: "result",
                subtype: "error",
                result: message,
                uuid: randomUUID()
            };
        }
    }
}
