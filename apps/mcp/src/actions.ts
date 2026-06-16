import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { getConnector } from "@webmana/connectors";
import { decryptSecrets } from "@webmana/crypto";

/** Verify a project belongs to the org, returning its primary domain. */
async function projectInOrg(db: Database, organizationId: string, projectId: string) {
  const [row] = await db
    .select({ id: schema.projects.id, domain: schema.projects.domain })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** List a project's connectors with their available + enabled (granted) actions. */
export async function listConnectorActions(db: Database, organizationId: string, projectId: string) {
  const project = await projectInOrg(db, organizationId, projectId);
  if (!project) return { error: "project not found or not visible to this token" };

  const rows = await db
    .select({
      id: schema.connectorInstances.id,
      connectorId: schema.connectorInstances.connectorId,
      enabledActions: schema.connectorInstances.enabledActions,
    })
    .from(schema.connectorInstances)
    .where(eq(schema.connectorInstances.projectId, projectId));

  return {
    projectId,
    connectors: rows.map((r) => ({
      connectorInstanceId: r.id,
      connectorId: r.connectorId,
      enabledActions: (r.enabledActions as string[]) ?? [],
      availableActions: (getConnector(r.connectorId)?.actions ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        destructive: a.destructive ?? false,
      })),
    })),
  };
}

export interface RunActionArgs {
  projectId: string;
  connectorInstanceId: string;
  actionId: string;
  input?: unknown;
}

/**
 * Run a connector action from MCP. Enforces org scope + the capability grant,
 * validates input, decrypts secrets, executes, and records a timeline event +
 * audit entry attributed to the MCP token's role.
 */
export async function runConnectorAction(
  db: Database,
  organizationId: string,
  role: string,
  args: RunActionArgs,
) {
  const project = await projectInOrg(db, organizationId, args.projectId);
  if (!project) return { ok: false, error: "project not found or not visible to this token" };

  const [inst] = await db
    .select({
      id: schema.connectorInstances.id,
      connectorId: schema.connectorInstances.connectorId,
      config: schema.connectorInstances.config,
      encryptedSecrets: schema.connectorInstances.encryptedSecrets,
      enabledActions: schema.connectorInstances.enabledActions,
    })
    .from(schema.connectorInstances)
    .where(
      and(
        eq(schema.connectorInstances.id, args.connectorInstanceId),
        eq(schema.connectorInstances.projectId, args.projectId),
      ),
    )
    .limit(1);
  if (!inst) return { ok: false, error: "connector not found" };

  const enabled = (inst.enabledActions as string[]) ?? [];
  if (!enabled.includes(args.actionId)) {
    return { ok: false, error: `action "${args.actionId}" is not enabled for this connector` };
  }
  const action = getConnector(inst.connectorId)?.actions?.find((a) => a.id === args.actionId);
  if (!action) return { ok: false, error: `unknown action "${args.actionId}"` };

  const parsed = action.inputSchema.safeParse(args.input ?? {});
  if (!parsed.success) return { ok: false, error: `invalid action input: ${parsed.error.message}` };

  const secrets = inst.encryptedSecrets ? decryptSecrets(inst.encryptedSecrets) : undefined;
  const now = new Date();
  let result: { ok: boolean; message?: string; data?: Record<string, unknown> };
  try {
    result = await action.run(
      { projectId: args.projectId, domain: project.domain ?? "", config: (inst.config as Record<string, unknown>) ?? {}, secrets, now },
      parsed.data,
    );
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  await db.insert(schema.events).values({
    projectId: args.projectId,
    connectorId: inst.connectorId,
    severity: result.ok ? "info" : "warning",
    title: `Action: ${action.title}`,
    description: `${args.actionId} via MCP → ${result.ok ? "ok" : "failed"}${result.message ? `: ${result.message}` : ""}`,
    occurredAt: now,
  });
  await db.insert(schema.auditLog).values({
    actorEmail: `mcp:${role}`,
    actorRole: role,
    action: `mcp run_connector_action ${inst.connectorId}.${args.actionId}`,
    method: "MCP",
    path: `/projects/${args.projectId}/connectors/${inst.id}/actions/${args.actionId}`,
    targetId: args.projectId,
    statusCode: result.ok ? 200 : 502,
  });

  return result;
}
