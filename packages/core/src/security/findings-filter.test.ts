import test from "node:test";
import assert from "node:assert/strict";
import {
    FindingsFilter,
    ResilientModelCalibrator,
    type FindingModelCalibrator,
    type SecurityFinding
} from "./findings-filter.js";

class MockCalibrator implements FindingModelCalibrator {
    constructor(
        private readonly fn: (finding: SecurityFinding) => Promise<{ keepFinding: boolean; confidenceScore: number; exclusionReason?: string }>
    ) { }

    async analyzeFinding(finding: SecurityFinding) {
        const result = await this.fn(finding);
        return {
            keepFinding: result.keepFinding,
            confidenceScore: result.confidenceScore,
            exclusionReason: result.exclusionReason
        };
    }
}

test("findings filter applies hard exclusions and keeps audit trail", async () => {
    const filter = new FindingsFilter({
        useHardExclusions: true,
        useModelFiltering: false
    });

    const output = await filter.filterFindings([
        { file: "README.md", description: "sql injection" },
        { file: "src/app.ts", description: "real vulnerability" }
    ]);

    assert.equal(output.filteredFindings.length, 1);
    assert.equal(output.excludedFindings.length, 1);
    assert.equal(output.excludedFindings[0].filterStage, "hard_rules");
    assert.match(output.excludedFindings[0].exclusionReason, /Markdown/i);
});

test("findings filter applies model calibration and excludes low confidence", async () => {
    const calibrator = new MockCalibrator(async (finding) => {
        if (String(finding.description).includes("weak")) {
            return { keepFinding: false, confidenceScore: 3, exclusionReason: "Low confidence score: 3" };
        }
        return { keepFinding: true, confidenceScore: 9 };
    });
    const filter = new FindingsFilter({
        useHardExclusions: false,
        useModelFiltering: true,
        modelCalibrator: calibrator,
        minConfidenceScore: 7
    });

    const output = await filter.filterFindings([
        { file: "src/a.ts", description: "weak signal" },
        { file: "src/b.ts", description: "strong signal" }
    ]);

    assert.equal(output.filteredFindings.length, 1);
    assert.equal(output.excludedFindings.length, 1);
    assert.equal(output.excludedFindings[0].filterStage, "model");
});

test("findings filter is fail-open when calibrator fails", async () => {
    const filter = new FindingsFilter({
        useHardExclusions: false,
        useModelFiltering: true,
        modelCalibrator: new MockCalibrator(async () => {
            throw new Error("network down");
        })
    });

    const output = await filter.filterFindings([{ file: "src/app.ts", description: "possible vuln" }]);
    assert.equal(output.filteredFindings.length, 1);
    assert.equal(output.excludedFindings.length, 0);
    assert.equal(output.filteredFindings[0]._filterMetadata?.source, "fallback_keep");
});

test("resilient model calibrator retries with smaller prompt on PROMPT_TOO_LONG", async () => {
    let calls = 0;
    const calibrator = new ResilientModelCalibrator({
        async callModel(prompt: string) {
            calls++;
            if (prompt.includes("Repository:")) {
                return "PROMPT_TOO_LONG";
            }
            return '{"keepFinding":true,"confidenceScore":8,"justification":"ok"}';
        }
    });

    const result = await calibrator.analyzeFinding(
        { file: "src/app.ts", description: "check this" },
        { repository: "repo/a", pullRequestNumber: 10, pullRequestTitle: "test" }
    );
    assert.equal(result.keepFinding, true);
    assert.equal(result.confidenceScore, 8);
    assert.equal(calls >= 2, true);
});
