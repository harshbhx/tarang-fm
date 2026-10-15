-- Vectors of items embedded in the last two hours (int8, base64). The vector index answers a new vector only after
-- a lag, so items embedded in an earlier step of the same refresh are compared here, exactly.
CREATE TABLE IF NOT EXISTS news_vec (
  id TEXT PRIMARY KEY,
  pool TEXT NOT NULL,
  at INTEGER NOT NULL,
  vec TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS news_vec_recent ON news_vec (pool, at);
