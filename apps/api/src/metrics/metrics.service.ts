import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
/** Cap points returned per metric so charts stay light. */
const MAX_POINTS = 500;

export interface MetricPoint {
  /** ISO timestamp. */
  t: string;
  v: number;
}

export interface MetricSeries {
  name: string;
  unit: string | null;
  points: MetricPoint[];
}

@Injectable()
export class MetricsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Time-series for a project over the window, grouped by metric name. */
  async history(projectId: string, windowDays?: number, names?: string[]): Promise<MetricSeries[]> {
    const days = Math.min(Math.max(windowDays || DEFAULT_WINDOW_DAYS, 1), MAX_WINDOW_DAYS);
    const since = new Date(Date.now() - days * DAY_MS);

    const where = names?.length
      ? and(
          eq(schema.metrics.projectId, projectId),
          gte(schema.metrics.observedAt, since),
          inArray(schema.metrics.name, names),
        )
      : and(eq(schema.metrics.projectId, projectId), gte(schema.metrics.observedAt, since));

    const rows = await this.db
      .select({
        name: schema.metrics.name,
        unit: schema.metrics.unit,
        value: schema.metrics.value,
        observedAt: schema.metrics.observedAt,
      })
      .from(schema.metrics)
      .where(where)
      .orderBy(asc(schema.metrics.observedAt));

    // Group by metric name, then evenly downsample to MAX_POINTS.
    const byName = new Map<string, { unit: string | null; points: MetricPoint[] }>();
    for (const r of rows) {
      const entry = byName.get(r.name) ?? { unit: r.unit, points: [] };
      entry.points.push({ t: r.observedAt.toISOString(), v: r.value });
      byName.set(r.name, entry);
    }

    return [...byName.entries()].map(([name, { unit, points }]) => ({
      name,
      unit,
      points: downsample(points, MAX_POINTS),
    }));
  }
}

/** Keep every Nth point so a series never exceeds `max` points. */
function downsample(points: MetricPoint[], max: number): MetricPoint[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: MetricPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  // Always include the most recent point.
  const last = points[points.length - 1]!;
  if (out[out.length - 1]!.t !== last.t) out.push(last);
  return out;
}
