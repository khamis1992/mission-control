# Database Schema Plan - Memory Feature Enhancement

## New Tables

### 1. search_history
```sql
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  timestamp INTEGER NOT NULL,  -- UNIX timestamp
  FOREIGN KEY (user_id) REFERENCES users(username)
);

CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_search_history_timestamp ON search_history(timestamp);
```
**Purpose**: Track user search history for suggestions and analytics

---

### 2. search_stats
```sql
CREATE TABLE IF NOT EXISTS search_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_term TEXT NOT NULL,
  total_results INTEGER NOT NULL,
  result_type TEXT,  -- 'task', 'memory', 'all'
  timestamp INTEGER NOT NULL,
  user_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(username)
);

CREATE INDEX idx_search_stats_term ON search_stats(search_term);
CREATE INDEX idx_search_stats_timestamp ON search_stats(timestamp);
```
**Purpose**: Analytics on search usage patterns

---

### 3. memory_templates
```sql
CREATE TABLE IF NOT EXISTS memory_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(username)
);

CREATE INDEX idx_memory_templates_name ON memory_templates(name);
```
**Purpose**: Store reusable task templates

---

### 4. memory_entities
```sql
CREATE TABLE IF NOT EXISTS memory_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- person, date, organization, location, etc.
  entity_text TEXT NOT NULL,
  line_number INTEGER,
  start_pos INTEGER,
  end_pos INTEGER,
  confidence REAL DEFAULT 1.0,
  FOREIGN KEY (file_path) REFERENCES memory_fts(path)  -- virtual table
);
```
**Purpose**: Store extracted entities from memory files

---

### 5. memory_versions
```sql
CREATE TABLE IF NOT EXISTS memory_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  diff TEXT,  -- JSON array of changes
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (file_path) REFERENCES memory_fts(path),
  FOREIGN KEY (created_by) REFERENCES users(username),
  UNIQUE(file_path, version)
);

CREATE INDEX idx_memory_versions_file ON memory_versions(file_path);
CREATE INDEX idx_memory_versions_timestamp ON memory_versions(created_at);
```
**Purpose**: Track file version history

---

### 6. web_search_cache
```sql
CREATE TABLE IF NOT EXISTS web_search_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  engine TEXT NOT NULL,
  results TEXT NOT NULL,  -- JSON blob of results
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_web_search_cache_query ON web_search_cache(query);
CREATE INDEX idx_web_search_cache_expires ON web_search_cache(expires_at);
```
**Purpose**: Cache web search results to reduce API calls

---

### 7. memory_action_items
```sql
CREATE TABLE IF NOT EXISTS memory_action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  action_type TEXT NOT NULL,  -- todo, deadline, action, decision
  text TEXT NOT NULL,
  due_date INTEGER,  -- UNIX timestamp
  priority TEXT DEFAULT 'medium',  -- low, medium, high
  line_number INTEGER,
  resolved INTEGER DEFAULT 0,
  resolved_at INTEGER,
  FOREIGN KEY (file_path) REFERENCES memory_fts(path)
);

CREATE INDEX idx_action_items_resolved ON memory_action_items(resolved);
CREATE INDEX idx_action_items_due ON memory_action_items(due_date);
```
**Purpose**: Extract and track TODO items from memory

---

### 8. memory_links
```sql
CREATE TABLE IF NOT EXISTS memory_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file TEXT NOT NULL,
  target_file TEXT NOT NULL,
  line_number INTEGER,
  link_type TEXT DEFAULT 'wiki',  -- wiki, task, reference
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_file) REFERENCES memory_fts(path),
  FOREIGN KEY (target_file) REFERENCES memory_fts(path),
  UNIQUE(source_file, target_file, line_number)
);

CREATE INDEX idx_memory_links_source ON memory_links(source_file);
CREATE INDEX idx_memory_links_target ON memory_links(target_file);
```
**Purpose**: Build relationship graph between memory files

---

## Modified Tables

### Existing: memory_fts_meta
**Add columns**:
```sql
ALTER TABLE memory_fts_meta ADD COLUMN last_entity_extraction INTEGER;
ALTER TABLE memory_fts_meta ADD COLUMN last_action_item_extraction INTEGER;
```
**Purpose**: Track last time each extraction task ran

---

## New Indexes

### Existing: memory_fts
**Add BM25 configuration**:
```sql
-- Already exists via FTS5
-- Optimize with custom preferences:
PRAGMA table_info(memory_fts);  -- Check current config
```

### New: Performance indexes
```sql
-- For search pagination
CREATE INDEX idx_search_history_recent ON search_history(timestamp DESC);

-- For analytics
CREATE INDEX idx_search_stats_daily ON search_stats(search_term, timestamp);
```

---

## Database Functions

### FTS5 Custom Ranking
```sql
-- Already using bm25() function
-- Could add custom weightings for priority
```

### Content Hash Function
```sql
-- Already using SQLite's hash functions
-- Example: SUBSTR(hex(hash), 1, 16) for versioning
```

---

## Migration Script

```sql
-- memory_feature_enhancement_v1.sql

-- New tables
CREATE TABLE IF NOT EXISTS search_history (...);
CREATE TABLE IF NOT EXISTS search_stats (...);
CREATE TABLE IF NOT EXISTS memory_templates (...);
CREATE TABLE IF NOT EXISTS memory_entities (...);
CREATE TABLE IF NOT EXISTS memory_versions (...);
CREATE TABLE IF NOT EXISTS web_search_cache (...);
CREATE TABLE IF NOT EXISTS memory_action_items (...);
CREATE TABLE IF NOT EXISTS memory_links (...);

-- Add columns to existing tables
ALTER TABLE memory_fts_meta ADD COLUMN last_entity_extraction INTEGER;
ALTER TABLE memory_fts_meta ADD COLUMN last_action_item_extraction INTEGER;

-- Add indexes
CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_search_history_timestamp ON search_history(timestamp);
-- ... (other indexes)

-- Update schema version
UPDATE memory_fts_meta SET value = 'v2' WHERE key = 'schema_version';
```

---

## Database Access Layer

### New Methods in `src/lib/db.ts`

```typescript
export interface SearchHistory {
  query: string;
  results_count: number;
  timestamp: number;
}

export interface MemoryTemplate {
  name: string;
  path: string;
  content: string;
  version: number;
}

export interface MemoryEntity {
  file_path: string;
  entity_type: string;
  entity_text: string;
  confidence: number;
}

// Add to db helpers:
db_helpers.getSearchHistory = async (userId: string, limit: number = 10) => ...
db_helpers.saveSearchHistory = async (userId: string, query: string, results: number) => ...
db_helpers.saveSearchStats = async (query: string, results: number, type: string) => ...
db_helpers.getMemoryTemplates = async () => ...
db_helpers.saveMemoryTemplate = async (template: MemoryTemplate) => ...
db_helpers.extractEntities = async (content: string, filePath: string) => ...
db_helpers.getVersionHistory = async (filePath: string, limit: number) => ...
db_helpers.cacheWebSearch = async (query: string, engine: string, results: any) => ...
db_helpers.getWebSearchCache = async (query: string, engine: string) => ...
db_helpers.extractActionItems = async (content: string, filePath: string) => ...
db_helpers.saveMemoryLinks = async (links: MemoryLink[]) => ...
```

---

## Security Considerations

| Table | Access Level | Notes |
|-------|--------------|-------|
| search_history | user | Store per-user searches |
| search_stats | admin | Analytics only |
| memory_templates | admin/operator | Only authorized users |
| memory_entities | read-only | Extracted data |
| memory_versions | admin | Only for rollbacks |
| web_search_cache | read-only | Cached API responses |
| memory_action_items | read-only | Extracted data |
| memory_links | read-only | Relationship data |

---

## Performance Optimizations

1. **Caching**: Web search cache with TTL expiration
2. **Indexing**: Strategic indexes on frequently queried columns
3. **Batch Operations**: Bulk insert for entity extraction
4. **Async Processing**: Extract entities/action items in background

---

## Data Retention Policy

| Table | Retention | Notes |
|-------|-----------|-------|
| search_history | 90 days | Recent searches only |
| search_stats | 1 year | Analytics history |
| web_search_cache | 24 hours | Fresh API results |
| memory_entities | In-memory | Re-extracted on changes |
| memory_action_items | 90 days | Or manual cleanup |
