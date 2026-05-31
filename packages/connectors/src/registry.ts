import type { ConnectorId } from "@webmana/contracts";
import type { Connector } from "./types.js";
import { sslConnector } from "./builtin/ssl.js";

/** All connectors known to Webmana, keyed by id. */
export const connectors = {
  ssl: sslConnector,
} satisfies Partial<Record<ConnectorId, Connector>>;

export function getConnector(id: string): Connector | undefined {
  return (connectors as Record<string, Connector>)[id];
}
