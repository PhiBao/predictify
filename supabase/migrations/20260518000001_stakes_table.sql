CREATE TABLE IF NOT EXISTS stakes (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  "user" TEXT NOT NULL,
  outcome_index INT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, "user", outcome_index)
);

CREATE INDEX IF NOT EXISTS idx_stakes_market_user ON stakes(market_id, "user");
CREATE INDEX IF NOT EXISTS idx_stakes_market ON stakes(market_id);
