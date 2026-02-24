import { chromium, Browser, Page } from "playwright";
import { z } from "zod";
import { ToolDefinition } from "@omni-agent/core";

let browser: Browser | null = null;
let page: Page | null = null;

async function ensureBrowser() {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
    }
    if (!page) {
        page = await browser.newPage();
    }
    return page;
}

export const browserTool = (): ToolDefinition => ({
    name: "browser",
    description: "Controls a web browser to navigate, interact with elements, and extract data. Supports 'navigate', 'click', 'type', 'extract_text', and 'screenshot'.",
    parameters: z.object({
        action: z.enum(["navigate", "click", "type", "extract_text", "screenshot"]).describe("The action to perform"),
        url: z.string().optional().describe("URL for 'navigate' action"),
        selector: z.string().optional().describe("CSS selector for 'click' or 'type' actions"),
        text: z.string().optional().describe("Text to type for 'type' action")
    }),
    execute: async ({ action, url, selector, text }) => {
        try {
            const p = await ensureBrowser();

            switch (action) {
                case "navigate":
                    if (!url) throw new Error("URL is required for 'navigate'");
                    await p.goto(url, { waitUntil: "networkidle" });
                    const title = await p.title();
                    return `Successfully navigated to ${url}. Page title: ${title}`;

                case "click":
                    if (!selector) throw new Error("Selector is required for 'click'");
                    await p.click(selector);
                    return `Successfully clicked on ${selector}`;

                case "type":
                    if (!selector || text === undefined) throw new Error("Selector and text are required for 'type'");
                    await p.fill(selector, text);
                    return `Successfully typed into ${selector}`;

                case "extract_text":
                    const content = await p.innerText("body");
                    return content.slice(0, 5000); // Truncate for context

                case "screenshot":
                    const buffer = await p.screenshot();
                    return `Screenshot captured (base64 simulation): ${buffer.length} bytes. [In a real environment, this would be saved as an artifact]`;

                default:
                    throw new Error(`Unknown browser action: ${action}`);
            }
        } catch (error: any) {
            return `Browser error (${action}): ${error.message}`;
        }
    }
});

// Cleanup helper (exported for loop termination)
export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
    }
}
