import { createDefaultProviderRegistry, ModelRouter, ProviderModelManager } from "@omni-agent/providers";

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
    optionsByProvider: {
      openai: { model: "gpt-4o" },
      "llama-cpp": { model: process.env.LLAMA_CPP_MODEL }
    },
    refreshIntervalMs: 60_000,
    defaultCooldownMs: 120_000
  });
  const router = new ModelRouter({
    registry,
    modelManager: manager,
    optionsByProvider: {
      openai: { model: "gpt-4o" },
      "llama-cpp": { model: process.env.LLAMA_CPP_MODEL }
    },
    defaultCooldownMs: 120_000
  });

  await manager.refreshAllProviders();

  const preferred = manager.chooseModel("openai", "gpt-4o");
  console.log("Preferred model:", preferred);

  // Example failure cooldown
  manager.markModelFailure("openai", "gpt-4o", new Error("quota exceeded"));
  const fallback = manager.chooseModel("openai", "gpt-4o");
  console.log("Fallback model after cooldown:", fallback);

  const routed = await router.generateText(
    [{ role: "user", content: "Responda em uma frase o que e fallback de modelos." }],
    {
      providerPriority: ["openai", "llama-cpp"],
      allowProviderFallback: true
    }
  );
  console.log("Routed provider/model:", routed.provider, routed.model);
  console.log("Routed response:", routed.response.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
