import type { ConnectorId } from "@webmana/contracts";
import type { Connector } from "./types.js";
import { sslConnector } from "./builtin/ssl.js";
import { uptimeConnector } from "./builtin/uptime.js";
import { dnsConnector } from "./builtin/dns.js";
import { whoisConnector } from "./builtin/whois.js";

/** All connectors known to Webmana, keyed by id. */
export const connectors = {
  ssl: sslConnector,
  uptime: uptimeConnector,
  dns: dnsConnector,
  whois: whoisConnector,
} satisfies Partial<Record<ConnectorId, Connector>>;

export function getConnector(id: string): Connector | undefined {
  return (connectors as Record<string, Connector>)[id];
}
