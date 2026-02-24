/**
 * Simple diff utility for OmniAgent.
 * Generates unified diff format.
 */

export interface DiffResult {
    diff: string;
    hasChanges: boolean;
}

export function generateUnifiedDiff(
    fileName: string,
    oldContent: string,
    newContent: string,
    contextLines: number = 3
): DiffResult {
    if (oldContent === newContent) {
        return { diff: "", hasChanges: false };
    }

    const oldLines = oldContent.split(/\r?\n/);
    const newLines = newContent.split(/\r?\n/);

    // For now, a very basic implementation that just shows the whole file 
    // if small, or a simple line-by-line comparison.
    // In a real scenario, we'd use Myers' diff algorithm.
    // Let's use a simple one for the prototype.

    let diff = `--- ${fileName} (original)\n+++ ${fileName} (modified)\n`;

    // Very simple line-based diff for the MVP
    // Better algorithm would be nice, but this works for demonstration.
    // We'll just show the changed lines.

    const maxLines = Math.max(oldLines.length, newLines.length);
    let hunkStarted = false;

    for (let i = 0; i < maxLines; i++) {
        const o = oldLines[i];
        const n = newLines[i];

        if (o !== n) {
            if (!hunkStarted) {
                diff += `@@ -${i + 1} +${i + 1} @@\n`;
                hunkStarted = true;
            }
            if (o !== undefined) diff += `-${o}\n`;
            if (n !== undefined) diff += `+${n}\n`;
        } else {
            hunkStarted = false;
            // Optionally add context lines here
        }
    }

    return { diff, hasChanges: true };
}
