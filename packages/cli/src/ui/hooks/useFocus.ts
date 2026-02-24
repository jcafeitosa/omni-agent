import { useStdin, useStdout } from 'ink';
import { useEffect, useState } from 'react';

// ANSI escape codes to enable/disable terminal focus reporting
export const ENABLE_FOCUS_REPORTING = '\x1b[?1004h';
export const DISABLE_FOCUS_REPORTING = '\x1b[?1004l';

// ANSI escape codes for focus events
export const FOCUS_IN = '\x1b[I';
export const FOCUS_OUT = '\x1b[O';

/**
 * useFocus
 * Tracks whether the terminal window has focus.
 * Useful for switching to "dimmed" or "paused" states.
 */
export const useFocus = (): {
    isFocused: boolean;
} => {
    const { stdin } = useStdin();
    const { stdout } = useStdout();
    const [isFocused, setIsFocused] = useState(true);

    useEffect(() => {
        const handleData = (data: Buffer) => {
            const sequence = data.toString();
            const lastFocusIn = sequence.lastIndexOf(FOCUS_IN);
            const lastFocusOut = sequence.lastIndexOf(FOCUS_OUT);

            if (lastFocusIn > lastFocusOut) {
                setIsFocused(true);
            } else if (lastFocusOut > lastFocusIn) {
                setIsFocused(false);
            }
        };

        // Enable focus reporting
        stdout?.write(ENABLE_FOCUS_REPORTING);
        stdin?.on('data', handleData);

        return () => {
            // Disable focus reporting on cleanup
            stdout?.write(DISABLE_FOCUS_REPORTING);
            stdin?.removeListener('data', handleData);
        };
    }, [stdin, stdout]);

    return { isFocused };
};
