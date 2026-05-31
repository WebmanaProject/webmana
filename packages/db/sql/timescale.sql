-- Webmana TimescaleDB setup.
-- Run AFTER Drizzle migrations have created the base tables.
-- Idempotent where TimescaleDB supports it.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Promote the metrics table to a hypertable partitioned on observed_at.
SELECT create_hypertable('metrics', 'observed_at', if_not_exists => TRUE);

-- Retention: keep raw points for 90 days.
SELECT add_retention_policy('metrics', INTERVAL '90 days', if_not_exists => TRUE);

-- Hourly rollup (continuous aggregate), kept 1 year.
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  project_id,
  connector_id,
  name,
  time_bucket(INTERVAL '1 hour', observed_at) AS bucket,
  avg(value) AS avg_value,
  min(value) AS min_value,
  max(value) AS max_value,
  count(*)   AS sample_count
FROM metrics
GROUP BY project_id, connector_id, name, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_hourly',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

SELECT add_retention_policy('metrics_hourly', INTERVAL '1 year', if_not_exists => TRUE);

-- Daily rollup, kept indefinitely (no retention policy).
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_daily
WITH (timescaledb.continuous) AS
SELECT
  project_id,
  connector_id,
  name,
  time_bucket(INTERVAL '1 day', observed_at) AS bucket,
  avg(value) AS avg_value,
  min(value) AS min_value,
  max(value) AS max_value,
  count(*)   AS sample_count
FROM metrics
GROUP BY project_id, connector_id, name, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_daily',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE);
