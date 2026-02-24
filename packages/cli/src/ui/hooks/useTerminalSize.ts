import { useEffect, useState } from 'react';

/**
 * useTerminalSize
 * Tracks the current terminal width and height.
 */
export function useTerminalSize(): { columns: number; rows: number } {
    const [size, setSize] = useState({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
    });

    useEffect(() => {
        function updateSize() {
            setSize({
                columns: process.stdout.columns || 80,
                rows: process.stdout.rows || 24,
            });
        }

        process.stdout.on('resize', updateSize);
        return () => {
            process.stdout.off('resize', updateSize);
        };
    }, []);

    return size;
}
