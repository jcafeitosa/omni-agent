export interface MetricSample {
    name: string;
    value: number;
    tags?: Record<string, string>;
    ts: number;
    type: "counter" | "histogram";
}

export interface OTelLiteOptions {
    serviceName: string;
    serviceVersion?: string;
    environment?: string;
}

export class OTelLiteManager {
    private readonly options: OTelLiteOptions;
    private readonly samples: MetricSample[] = [];
    private readonly counters = new Map<string, number>();

    constructor(options: OTelLiteOptions) {
        this.options = options;
    }

    public counter(name: string, value = 1, tags?: Record<string, string>): void {
        const key = this.makeKey(name, tags);
        this.counters.set(key, (this.counters.get(key) || 0) + value);
        this.samples.push({ name, value, tags, ts: Date.now(), type: "counter" });
    }

    public histogram(name: string, value: number, tags?: Record<string, string>): void {
        this.samples.push({ name, value, tags, ts: Date.now(), type: "histogram" });
    }

    public event(name: string, tags?: Record<string, string>): void {
        this.counter(name, 1, tags);
    }

    public snapshot(): {
        serviceName: string;
        serviceVersion?: string;
        environment?: string;
        counters: Array<{ key: string; value: number }>;
        samples: MetricSample[];
    } {
        return {
            serviceName: this.options.serviceName,
            serviceVersion: this.options.serviceVersion,
            environment: this.options.environment,
            counters: Array.from(this.counters.entries()).map(([key, value]) => ({ key, value })),
            samples: [...this.samples]
        };
    }

    private makeKey(name: string, tags?: Record<string, string>): string {
        if (!tags || Object.keys(tags).length === 0) return name;
        const pairs = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`);
        return `${name}|${pairs.join(",")}`;
    }
}
