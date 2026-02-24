import { parseJsonWithFallbacks } from "../helpers/json-fallback-parser.js";

export interface SecurityFinding {
    file?: string;
    line?: number;
    severity?: string;
    category?: string;
    title?: string;
    description?: string;
    [key: string]: any;
}

export interface FindingFilterContext {
    repository?: string;
    pullRequestNumber?: number;
    pullRequestTitle?: string;
    pullRequestBody?: string;
}

export interface ModelCalibrationResult {
    keepFinding: boolean;
    confidenceScore: number;
    exclusionReason?: string;
    justification?: string;
}

export interface FindingModelCalibrator {
    analyzeFinding(
        finding: SecurityFinding,
        context?: FindingFilterContext
    ): Promise<ModelCalibrationResult>;
}

export interface FilteredFinding extends SecurityFinding {
    _filterMetadata?: {
        confidenceScore: number;
        justification?: string;
        source: "hard_rules" | "model" | "fallback_keep";
    };
}

export interface ExcludedFindingDetail {
    finding: SecurityFinding;
    filterStage: "hard_rules" | "model";
    exclusionReason: string;
    confidenceScore?: number;
    justification?: string;
    ruleId?: string;
}

export interface FindingsFilterStats {
    totalFindings: number;
    hardExcluded: number;
    modelExcluded: number;
    keptFindings: number;
    exclusionBreakdown: Record<string, number>;
    averageConfidence?: number;
}

export interface FindingsFilterOutput {
    filteredFindings: FilteredFinding[];
    excludedFindings: ExcludedFindingDetail[];
    analysisSummary: FindingsFilterStats;
}

export interface FindingsFilterOptions {
    useHardExclusions?: boolean;
    useModelFiltering?: boolean;
    modelCalibrator?: FindingModelCalibrator;
    excludedDirectories?: string[];
    minConfidenceScore?: number;
}

const DOS_PATTERNS = [
    /\b(denial of service|dos attack|resource exhaustion)\b/i,
    /\b(exhaust|overwhelm|overload).*?(resource|memory|cpu)\b/i,
    /\b(infinite|unbounded).*?(loop|recursion)\b/i
];
const RATE_LIMIT_PATTERNS = [
    /\b(missing|lack of|no)\s+rate\s+limit/i,
    /\brate\s+limiting\s+(missing|required|not implemented)\b/i,
    /\bunlimited\s+(requests|calls|api)\b/i
];
const OPEN_REDIRECT_PATTERNS = [
    /\b(open redirect|unvalidated redirect)\b/i
];
const RESOURCE_PATTERNS = [
    /\b(resource|memory|file)\s+leak\s+potential\b/i,
    /\bunclosed\s+(resource|file|connection)\b/i
];

function toLower(value: unknown): string {
    return String(value || "").toLowerCase();
}

function classifyHardExclusion(
    finding: SecurityFinding,
    excludedDirectories: string[] = []
): { reason: string; ruleId: string } | undefined {
    const filePath = String(finding.file || "");
    const lowerFile = toLower(filePath);
    if (lowerFile.endsWith(".md")) {
        return { reason: "Finding in Markdown file", ruleId: "markdown_file" };
    }

    for (const dir of excludedDirectories) {
        const normalized = dir.replace(/^\.\//, "").replace(/\/+$/, "");
        if (!normalized) continue;
        if (filePath === normalized || filePath.startsWith(`${normalized}/`) || filePath.includes(`/${normalized}/`)) {
            return { reason: `Finding in excluded directory: ${normalized}`, ruleId: "excluded_directory" };
        }
    }

    const text = `${finding.title || ""} ${finding.description || ""}`.toLowerCase();
    if (DOS_PATTERNS.some((re) => re.test(text))) {
        return { reason: "Generic DOS/resource exhaustion finding", ruleId: "generic_dos" };
    }
    if (RATE_LIMIT_PATTERNS.some((re) => re.test(text))) {
        return { reason: "Generic rate limiting recommendation", ruleId: "generic_rate_limit" };
    }
    if (OPEN_REDIRECT_PATTERNS.some((re) => re.test(text))) {
        return { reason: "Open redirect finding (low signal)", ruleId: "open_redirect" };
    }
    if (RESOURCE_PATTERNS.some((re) => re.test(text))) {
        return { reason: "Resource management finding (low signal)", ruleId: "resource_management" };
    }
    return undefined;
}

export class FindingsFilter {
    private readonly useHardExclusions: boolean;
    private readonly useModelFiltering: boolean;
    private readonly modelCalibrator?: FindingModelCalibrator;
    private readonly excludedDirectories: string[];
    private readonly minConfidenceScore: number;

    constructor(options: FindingsFilterOptions = {}) {
        this.useHardExclusions = options.useHardExclusions !== false;
        this.useModelFiltering = options.useModelFiltering === true;
        this.modelCalibrator = options.modelCalibrator;
        this.excludedDirectories = options.excludedDirectories || [];
        this.minConfidenceScore = options.minConfidenceScore ?? 7;
    }

    public async filterFindings(
        findings: SecurityFinding[],
        context?: FindingFilterContext
    ): Promise<FindingsFilterOutput> {
        const excludedFindings: ExcludedFindingDetail[] = [];
        const keptAfterHard: SecurityFinding[] = [];
        const confidenceScores: number[] = [];
        const exclusionBreakdown: Record<string, number> = {};

        for (const finding of findings) {
            if (this.useHardExclusions) {
                const exclusion = classifyHardExclusion(finding, this.excludedDirectories);
                if (exclusion) {
                    excludedFindings.push({
                        finding,
                        filterStage: "hard_rules",
                        exclusionReason: exclusion.reason,
                        ruleId: exclusion.ruleId
                    });
                    exclusionBreakdown[exclusion.reason] = (exclusionBreakdown[exclusion.reason] || 0) + 1;
                    continue;
                }
            }
            keptAfterHard.push(finding);
        }

        const filteredFindings: FilteredFinding[] = [];
        for (const finding of keptAfterHard) {
            if (this.useModelFiltering && this.modelCalibrator) {
                try {
                    const calibration = await this.modelCalibrator.analyzeFinding(finding, context);
                    confidenceScores.push(calibration.confidenceScore);
                    if (!calibration.keepFinding || calibration.confidenceScore < this.minConfidenceScore) {
                        const reason = calibration.exclusionReason || `Low confidence score: ${calibration.confidenceScore}`;
                        excludedFindings.push({
                            finding,
                            filterStage: "model",
                            exclusionReason: reason,
                            confidenceScore: calibration.confidenceScore,
                            justification: calibration.justification
                        });
                        exclusionBreakdown[reason] = (exclusionBreakdown[reason] || 0) + 1;
                        continue;
                    }

                    filteredFindings.push({
                        ...finding,
                        _filterMetadata: {
                            confidenceScore: calibration.confidenceScore,
                            justification: calibration.justification,
                            source: "model"
                        }
                    });
                    continue;
                } catch (error: any) {
                    filteredFindings.push({
                        ...finding,
                        _filterMetadata: {
                            confidenceScore: 10,
                            justification: `Model calibration failed, fail-open keep: ${error?.message || String(error)}`,
                            source: "fallback_keep"
                        }
                    });
                    confidenceScores.push(10);
                    continue;
                }
            }

            filteredFindings.push({
                ...finding,
                _filterMetadata: {
                    confidenceScore: 10,
                    justification: "Model filtering disabled",
                    source: "hard_rules"
                }
            });
            confidenceScores.push(10);
        }

        const hardExcluded = excludedFindings.filter((f) => f.filterStage === "hard_rules").length;
        const modelExcluded = excludedFindings.filter((f) => f.filterStage === "model").length;
        const summary: FindingsFilterStats = {
            totalFindings: findings.length,
            hardExcluded,
            modelExcluded,
            keptFindings: filteredFindings.length,
            exclusionBreakdown,
            averageConfidence: confidenceScores.length
                ? confidenceScores.reduce((acc, item) => acc + item, 0) / confidenceScores.length
                : undefined
        };

        return {
            filteredFindings,
            excludedFindings,
            analysisSummary: summary
        };
    }
}

export interface ModelCalibratorOptions {
    callModel: (prompt: string) => Promise<string>;
    maxRetries?: number;
    retryDelayMs?: number;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCalibrationPrompt(
    finding: SecurityFinding,
    context?: FindingFilterContext,
    includeContext = true
): string {
    const contextBlock = includeContext
        ? `Context:\n- Repository: ${context?.repository || "unknown"}\n- PR: ${context?.pullRequestNumber || "unknown"}\n- Title: ${context?.pullRequestTitle || "unknown"}\n`
        : "Context omitted due to size constraints.\n";

    return `You are calibrating a security finding confidence score.\n${contextBlock}\nFinding JSON:\n${JSON.stringify(finding, null, 2)}\n\nReturn only JSON:\n{"keepFinding":true,"confidenceScore":9,"exclusionReason":null,"justification":"short rationale"}`;
}

function normalizeCalibrationResponse(raw: any): ModelCalibrationResult {
    return {
        keepFinding: Boolean(raw?.keepFinding),
        confidenceScore: Number(raw?.confidenceScore ?? 0),
        exclusionReason: raw?.exclusionReason ? String(raw.exclusionReason) : undefined,
        justification: raw?.justification ? String(raw.justification) : undefined
    };
}

export class ResilientModelCalibrator implements FindingModelCalibrator {
    private readonly callModel: (prompt: string) => Promise<string>;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;

    constructor(options: ModelCalibratorOptions) {
        this.callModel = options.callModel;
        this.maxRetries = options.maxRetries ?? 3;
        this.retryDelayMs = options.retryDelayMs ?? 300;
    }

    public async analyzeFinding(
        finding: SecurityFinding,
        context?: FindingFilterContext
    ): Promise<ModelCalibrationResult> {
        let includeContext = true;
        let lastError = "unknown";

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            const prompt = buildCalibrationPrompt(finding, context, includeContext);
            try {
                const rawOutput = await this.callModel(prompt);
                if (/PROMPT_TOO_LONG/i.test(rawOutput)) {
                    includeContext = false;
                    continue;
                }

                const parsed = parseJsonWithFallbacks<any>(rawOutput);
                if (!parsed.success || !parsed.data) {
                    lastError = parsed.error || "invalid JSON response";
                } else {
                    const normalized = normalizeCalibrationResponse(parsed.data);
                    if (!Number.isFinite(normalized.confidenceScore)) {
                        lastError = "invalid confidenceScore";
                    } else {
                        return normalized;
                    }
                }
            } catch (error: any) {
                lastError = error?.message || String(error);
                if (/PROMPT_TOO_LONG/i.test(lastError)) {
                    includeContext = false;
                    continue;
                }
            }

            if (attempt < this.maxRetries - 1) {
                await delay(this.retryDelayMs * (attempt + 1));
            }
        }

        throw new Error(`Failed to calibrate finding after retries: ${lastError}`);
    }
}
