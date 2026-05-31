/** A fired alert, ready to be delivered to a notification channel. */
export interface AlertNotification {
  projectId: string;
  projectName: string;
  domain: string;
  metricName: string;
  operator: string;
  threshold: number;
  value: number;
  severity: "info" | "warning" | "critical";
  firedAt: Date;
}

export interface AlertChannel {
  kind: "webhook" | "slack" | "email";
  config: Record<string, unknown>;
}

const OPERATOR_LABEL: Record<string, string> = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  eq: "==",
};

function summarize(n: AlertNotification): string {
  const op = OPERATOR_LABEL[n.operator] ?? n.operator;
  return `[${n.severity.toUpperCase()}] ${n.projectName} (${n.domain}): ${n.metricName} = ${n.value} (threshold ${op} ${n.threshold})`;
}

async function deliverWebhook(
  config: Record<string, unknown>,
  n: AlertNotification,
): Promise<void> {
  const url = typeof config.url === "string" ? config.url : undefined;
  if (!url) throw new Error("webhook channel missing 'url'");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: summarize(n),
      alert: { ...n, firedAt: n.firedAt.toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`webhook returned HTTP ${res.status}`);
}

async function deliverSlack(
  config: Record<string, unknown>,
  n: AlertNotification,
): Promise<void> {
  const url =
    typeof config.webhookUrl === "string" ? config.webhookUrl : undefined;
  if (!url) throw new Error("slack channel missing 'webhookUrl'");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: summarize(n) }),
  });
  if (!res.ok) throw new Error(`slack returned HTTP ${res.status}`);
}

/** Deliver one notification to one channel. Throws on delivery failure. */
export async function deliver(
  channel: AlertChannel,
  n: AlertNotification,
): Promise<void> {
  switch (channel.kind) {
    case "webhook":
      return deliverWebhook(channel.config, n);
    case "slack":
      return deliverSlack(channel.config, n);
    case "email":
      // SMTP delivery is deferred to a later step.
      throw new Error("email channel not yet implemented");
    default:
      throw new Error(`unknown channel kind "${channel.kind}"`);
  }
}
