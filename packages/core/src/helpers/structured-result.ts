import { z } from "zod";

export interface StructuredResultParse {
    value?: any;
    rawJson?: string;
    error?: string;
}

function extractJsonCandidate(text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
        return trimmed;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return undefined;
}

export function parseStructuredResult(
    text: string,
    schema?: z.ZodTypeAny,
    strict = true
): StructuredResultParse {
    const candidate = extractJsonCandidate(text);
    if (!candidate) {
        return { error: "No JSON object/array found in model output." };
    }

    let parsed: any;
    try {
        parsed = JSON.parse(candidate);
    } catch (error: any) {
        return { error: `Invalid JSON: ${error?.message || String(error)}`, rawJson: candidate };
    }

    if (!schema) {
        return { value: parsed, rawJson: candidate };
    }

    if (strict) {
        const validated = schema.safeParse(parsed);
        if (!validated.success) {
            return { error: validated.error.message, rawJson: candidate };
        }
        return { value: validated.data, rawJson: candidate };
    }

    try {
        return { value: schema.parse(parsed), rawJson: candidate };
    } catch (error: any) {
        return { error: error?.message || String(error), rawJson: candidate };
    }
}
