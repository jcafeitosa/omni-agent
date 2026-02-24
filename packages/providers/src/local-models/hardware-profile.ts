import os from "os";

export type HardwareProfile =
    | "auto"
    | "cpu-low"
    | "cpu-medium"
    | "cpu-high"
    | "gpu-low"
    | "gpu-high";

export interface HardwareSnapshot {
    cpuCores: number;
    totalMemoryGB: number;
    platform: NodeJS.Platform;
    hasGpuHint: boolean;
}

export interface HardwareRecommendation {
    preferredProfile: Exclude<HardwareProfile, "auto">;
    maxModelParamsB: number;
    preferredQuantizations: string[];
}

export function readHardwareSnapshot(): HardwareSnapshot {
    const totalMemoryGB = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
    const cpuCores = os.cpus().length;

    const hasGpuHint = Boolean(
        process.env.LLAMA_CPP_GPU === "1" ||
        process.env.CUDA_VISIBLE_DEVICES ||
        process.env.ROCM_VISIBLE_DEVICES ||
        process.env.METAL_DEVICE_WRAPPER_TYPE
    );

    return {
        cpuCores,
        totalMemoryGB,
        platform: os.platform(),
        hasGpuHint
    };
}

export function resolveHardwareProfile(profile: HardwareProfile, snapshot: HardwareSnapshot = readHardwareSnapshot()): Exclude<HardwareProfile, "auto"> {
    if (profile !== "auto") return profile;

    if (snapshot.hasGpuHint) {
        return snapshot.totalMemoryGB >= 24 ? "gpu-high" : "gpu-low";
    }

    if (snapshot.totalMemoryGB < 12 || snapshot.cpuCores <= 4) {
        return "cpu-low";
    }

    if (snapshot.totalMemoryGB < 24 || snapshot.cpuCores <= 8) {
        return "cpu-medium";
    }

    return "cpu-high";
}

export function getHardwareRecommendation(profile: HardwareProfile, snapshot: HardwareSnapshot = readHardwareSnapshot()): HardwareRecommendation {
    const resolved = resolveHardwareProfile(profile, snapshot);

    switch (resolved) {
        case "cpu-low":
            return {
                preferredProfile: resolved,
                maxModelParamsB: 8,
                preferredQuantizations: ["Q4_K_M", "Q4_K_S", "Q5_K_M"]
            };
        case "cpu-medium":
            return {
                preferredProfile: resolved,
                maxModelParamsB: 14,
                preferredQuantizations: ["Q4_K_M", "Q5_K_M", "Q6_K"]
            };
        case "cpu-high":
            return {
                preferredProfile: resolved,
                maxModelParamsB: 32,
                preferredQuantizations: ["Q5_K_M", "Q6_K", "Q8_0"]
            };
        case "gpu-low":
            return {
                preferredProfile: resolved,
                maxModelParamsB: 32,
                preferredQuantizations: ["Q5_K_M", "Q6_K", "Q8_0"]
            };
        case "gpu-high":
            return {
                preferredProfile: resolved,
                maxModelParamsB: 70,
                preferredQuantizations: ["Q6_K", "Q8_0", "F16"]
            };
    }
}
