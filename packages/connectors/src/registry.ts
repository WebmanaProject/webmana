import type { ConnectorId } from "@webmana/contracts";
import type { Connector } from "./types.js";
import { sslConnector } from "./builtin/ssl.js";
import { uptimeConnector } from "./builtin/uptime.js";
import { dnsConnector } from "./builtin/dns.js";
import { whoisConnector } from "./builtin/whois.js";
import { pagespeedConnector } from "./builtin/pagespeed.js";
import { uptimerobotConnector } from "./builtin/uptimerobot.js";
import { cloudflareConnector } from "./builtin/cloudflare.js";
import { ga4Connector } from "./builtin/ga4.js";
import { observatoryConnector } from "./builtin/observatory.js";
import { datadogConnector } from "./builtin/datadog.js";
import { elasticsearchConnector } from "./builtin/elasticsearch.js";
import { snykConnector } from "./builtin/snyk.js";
import { awsCostConnector } from "./builtin/aws-cost.js";

/** All connectors known to Webmana, keyed by id. */
export const connectors = {
  ssl: sslConnector,
  uptime: uptimeConnector,
  dns: dnsConnector,
  whois: whoisConnector,
  pagespeed: pagespeedConnector,
  uptimerobot: uptimerobotConnector,
  cloudflare: cloudflareConnector,
  ga4: ga4Connector,
  observatory: observatoryConnector,
  datadog: datadogConnector,
  elasticsearch: elasticsearchConnector,
  snyk: snykConnector,
  aws_cost: awsCostConnector,
} satisfies Partial<Record<ConnectorId, Connector>>;

export function getConnector(id: string): Connector | undefined {
  return (connectors as Record<string, Connector>)[id];
}
