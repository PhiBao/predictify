CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  "user" TEXT NOT NULL,
  outcome_index INT NOT NULL,
  shares BIGINT NOT NULL DEFAULT 0,
  avg_price BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, "user", outcome_index)
);

CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  "user" TEXT NOT NULL,
  outcome_index INT NOT NULL,
  shares BIGINT NOT NULL,
  price_per_share BIGINT NOT NULL,
  total_cost BIGINT NOT NULL,
  trade_type TEXT NOT NULL,
  timestamp TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_market_user ON positions(market_id, "user");
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades("user");

ALTER TABLE resolutions ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN DEFAULT FALSE;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS evidence_url TEXT;
