-- Newsroom pool: items per station, story clusters, what each station aired, refresh bookkeeping, feed health.

-- One row per (station pool, article). cluster_id = the story, topic_id = the developing topic it belongs to.
CREATE TABLE IF NOT EXISTS news_item (
  id TEXT PRIMARY KEY,
  pool TEXT NOT NULL,
  lang TEXT NOT NULL,
  bucket TEXT NOT NULL,
  state TEXT,
  city TEXT,
  title TEXT NOT NULL,
  descr TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  publisher_key TEXT,
  publisher_spoken TEXT,
  feed_id TEXT NOT NULL,
  mixed INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  title_key TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  light INTEGER NOT NULL DEFAULT 0,
  death INTEGER NOT NULL DEFAULT 0,
  question INTEGER NOT NULL DEFAULT 0,
  opinion INTEGER NOT NULL DEFAULT 0,
  tagged INTEGER NOT NULL DEFAULT 0,
  embedded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS news_item_pick ON news_item (pool, expires_at);
CREATE INDEX IF NOT EXISTS news_item_pending ON news_item (pool, tagged, embedded);
CREATE INDEX IF NOT EXISTS news_item_cluster ON news_item (pool, cluster_id);

-- One row per story per station: a station never airs a story twice (soft, across sessions).
CREATE TABLE IF NOT EXISTS news_aired (
  station TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  aired_at INTEGER NOT NULL,
  bulletin_id TEXT NOT NULL,
  PRIMARY KEY (station, cluster_id)
);
CREATE INDEX IF NOT EXISTS news_aired_topic ON news_aired (station, topic_id, aired_at);

-- scope: 'station:hi' | 'state:hi:GJ' | 'city:hi:vadodara'
CREATE TABLE IF NOT EXISTS news_refresh (
  scope TEXT PRIMARY KEY,
  refreshed_at INTEGER NOT NULL,
  unaired_at_refresh INTEGER NOT NULL DEFAULT 0,
  aired_since INTEGER NOT NULL DEFAULT 0,
  served_since INTEGER NOT NULL DEFAULT 0,
  last_served_at INTEGER,
  last_topup_at INTEGER,
  running_since INTEGER
);

-- Last fetch result per feed (edge health: which feeds work from Cloudflare).
CREATE TABLE IF NOT EXISTS news_feed (
  feed_id TEXT PRIMARY KEY,
  pool TEXT NOT NULL,
  url TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status INTEGER,
  items INTEGER NOT NULL DEFAULT 0,
  kept INTEGER NOT NULL DEFAULT 0,
  ms INTEGER,
  error TEXT,
  checked_at INTEGER NOT NULL,
  last_ok_at INTEGER
);
