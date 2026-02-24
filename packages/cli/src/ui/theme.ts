/**
 * Semantic tokens for the UI.
 */
export interface SemanticColors {
    background: string;
    foreground: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    muted: string;
    border: string;
    highlight: string;
}

/**
 * Color theme definition.
 */
export interface Theme {
    name: string;
    colors: SemanticColors;
}

export const defaultTheme: Theme = {
    name: "Omni-Dark",
    colors: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        accent: "#58a6ff",
        success: "#3fb950",
        warning: "#d29922",
        error: "#f85149",
        muted: "#8b949e",
        border: "#30363d",
        highlight: "#1f6feb",
    }
};

class ThemeManager {
    private currentTheme: Theme = defaultTheme;

    get theme(): Theme {
        return this.currentTheme;
    }

    setTheme(theme: Theme) {
        this.currentTheme = theme;
    }

    get colors(): SemanticColors {
        return this.currentTheme.colors;
    }
}

export const themeManager = new ThemeManager();
export const theme = themeManager.theme;
export const colors = themeManager.colors;
