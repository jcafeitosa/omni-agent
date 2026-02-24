import { createDefaultProviderRegistry, ProviderModelManager } from "@omni-agent/providers";

async function main() {
  const registry = createDefaultProviderRegistry({
    openai: { model: "gpt-4o" },
    llamaCpp: {
      modelDir: "./models",
      model: process.env.LLAMA_CPP_MODEL,
      autoStartServer: false
    }
  });

  const manager = new ProviderModelManager({
    registry,
    refreshIntervalMs: 60_000,
    defaultCooldownMs: 120_000
  });

  await manager.refreshAllProviders();

  const preferred = manager.chooseModel("openai", "gpt-4o");
  console.log("Preferred model:", preferred);

  // Example failure cooldown
  manager.markModelFailure("openai", "gpt-4o", new Error("quota exceeded"));
  const fallback = manager.chooseModel("openai", "gpt-4o");
  console.log("Fallback model after cooldown:", fallback);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
