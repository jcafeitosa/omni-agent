import test from "node:test";
import assert from "node:assert/strict";
import { OTelLiteManager } from "./otel-lite.js";

test("otel lite manager records counters and histograms", () => {
    const otel = new OTelLiteManager({ serviceName: "omni-agent", environment: "test" });
    otel.counter("turn.started", 1, { provider: "mock" });
    otel.counter("turn.started", 1, { provider: "mock" });
    otel.histogram("latency.ms", 42, { route: "generate" });

    const snapshot = otel.snapshot();
    const counter = snapshot.counters.find((c) => c.key.includes("turn.started"));
    assert.equal(counter?.value, 2);
    assert.equal(snapshot.samples.length, 3);
});
