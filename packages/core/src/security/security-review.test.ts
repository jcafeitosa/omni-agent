import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { runSecurityReview } from "./security-review.js";
import type { Provider } from "../index.js";

function git(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function createTempRepo(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "omni-sec-review-"));
    git(dir, ["init"]);
    git(dir, ["config", "user.email", "bot@example.com"]);
    git(dir, ["config", "user.name", "Bot"]);

    await writeFile(join(dir, "app.ts"), "export const a = 1;\n", "utf8");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "init"]);

    await writeFile(join(dir, "app.ts"), "export const a = 2;\nexport const user = (x:any)=>x;\n", "utf8");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "change"]);
    return dir;
}

test("runSecurityReview parses findings and counts high severity", async () => {
    const dir = await createTempRepo();
    try {
        const provider: Provider = {
            name: "mock",
            async generateText() {
                return {
                    text: JSON.stringify({
                        findings: [
                            {
                                file: "app.ts",
                                line: 2,
                                severity: "HIGH",
                                category: "injection",
                                description: "unsafe user input handling"
                            }
                        ],
                        analysis_summary: {
                            files_reviewed: 1,
                            high_severity: 1,
                            medium_severity: 0,
                            low_severity: 0,
                            review_completed: true
                        }
                    }),
                    toolCalls: []
                };
            },
            async embedText() {
                return [];
            },
            async embedBatch() {
                return [];
            },
            getModelLimits(model?: string) {
                return {
                    provider: "mock",
                    model: model || "mock-model",
                    contextWindowTokens: null,
                    maxOutputTokens: null,
                    maxInputTokens: null,
                    source: "unknown" as const
                };
            }
        };

        const result = await runSecurityReview({
            provider,
            workingDirectory: dir,
            filterOptions: { useModelFiltering: false }
        });

        assert.equal(result.findings.length, 1);
        assert.equal(result.highSeverityCount, 1);
        assert.equal(result.excludedFindings.length, 0);
        assert.equal(result.promptLength > 0, true);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("runSecurityReview applies hard exclusions from findings filter", async () => {
    const dir = await createTempRepo();
    try {
        const provider: Provider = {
            name: "mock",
            async generateText() {
                return {
                    text: JSON.stringify({
                        findings: [
                            {
                                file: "README.md",
                                line: 1,
                                severity: "HIGH",
                                description: "markdown issue"
                            },
                            {
                                file: "app.ts",
                                line: 2,
                                severity: "MEDIUM",
                                description: "real issue"
                            }
                        ]
                    }),
                    toolCalls: []
                };
            },
            async embedText() {
                return [];
            },
            async embedBatch() {
                return [];
            },
            getModelLimits(model?: string) {
                return {
                    provider: "mock",
                    model: model || "mock-model",
                    contextWindowTokens: null,
                    maxOutputTokens: null,
                    maxInputTokens: null,
                    source: "unknown" as const
                };
            }
        };

        const result = await runSecurityReview({
            provider,
            workingDirectory: dir,
            filterOptions: { useModelFiltering: false }
        });

        assert.equal(result.findings.length, 1);
        assert.equal(result.excludedFindings.length, 1);
        assert.match(result.excludedFindings[0].exclusionReason, /Markdown/i);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
