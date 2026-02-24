export interface JsonParseResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

function extractFromFencedCode(text: string): string | undefined {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return match?.[1]?.trim();
}

function extractBalancedObject(text: string): string | undefined {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === "{") {
            if (depth === 0) start = i;
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0 && start >= 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return undefined;
}

function tryParse<T>(raw: string): JsonParseResult<T> {
    try {
        return { success: true, data: JSON.parse(raw) as T };
    } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
    }
}

export function parseJsonWithFallbacks<T = any>(text: string): JsonParseResult<T> {
    const trimmed = text.trim();
    if (!trimmed) {
        return { success: false, error: "Empty response" };
    }

    const direct = tryParse<T>(trimmed);
    if (direct.success) return direct;

    const fenced = extractFromFencedCode(trimmed);
    if (fenced) {
        const parsed = tryParse<T>(fenced);
        if (parsed.success) return parsed;
    }

    const balanced = extractBalancedObject(trimmed);
    if (balanced) {
        const parsed = tryParse<T>(balanced);
        if (parsed.success) return parsed;
    }

    return {
        success: false,
        error: `Failed to parse JSON with fallbacks. Last error: ${direct.error || "unknown"}`
    };
}
