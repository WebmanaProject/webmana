/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * OpenTelemetry bootstrap. Enabled only when OTEL_EXPORTER_OTLP_ENDPOINT is set
 * (e.g. http://collector:4318) — otherwise a no-op with zero overhead. Imported
 * first in main.ts so auto-instrumentation wraps libraries before they load.
 */
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  try {
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

    process.env.OTEL_SERVICE_NAME ??= "webmana-api";
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    // eslint-disable-next-line no-console
    console.log(`[telemetry] OpenTelemetry enabled -> ${endpoint}`);

    const shutdown = (): void => {
      void sdk.shutdown().finally(() => process.exit(0));
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    // Never let telemetry setup break the app.
    console.error("[telemetry] failed to start:", err instanceof Error ? err.message : String(err));
  }
} else {
  // eslint-disable-next-line no-console
  console.log("[telemetry] disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)");
}

export {};
