import { LlamaCppProvider } from "@omni-agent/providers";

async function main() {
  const provider = new LlamaCppProvider({
    modelDir: "./models",
    hardwareProfile: "auto",
    huggingFace: {
      enabled: true,
      autoSuggestOnMissingModel: true,
      token: process.env.HUGGINGFACE_TOKEN
    }
  });

  const selected = await provider.selectModelForHardware({ preferLocal: true });
  console.log("selected:", selected);

  if (selected.source === "huggingface") {
    const dl = await provider.downloadRecommendedModel({
      recommendation: selected.suggestions?.[0],
      onProgress: (p) => {
        if (p.percent !== undefined) {
          process.stdout.write(`\rDownloading: ${p.percent}%`);
        }
      }
    });
    console.log("\nDownloaded:", dl.modelPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
