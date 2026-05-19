CREATE TABLE market_pools (
  market_id TEXT PRIMARY KEY,
  pools_json TEXT NOT NULL DEFAULT '[]',
  total_staked NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
