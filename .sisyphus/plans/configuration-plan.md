# Configuration Plan - Memory Feature Enhancement

## Environment Variables

### Web Search Configuration
```env
# Web search engine selection
WEB_SEARCH_ENGINE=google  # Options: google, bing, duckduckgo

# API keys for web search
# Google Custom Search JSON API
GOOGLE_CUSTOM_SEARCH_API_KEY=your-api-key
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your-engine-id

# Bing Search API (alternative)
BING_SEARCH_API_KEY=your-api-key

# DuckDuckGo (no API key needed, but limited features)
```

### Memory Configuration
```env
# Memory directory path
MEMORY_PATH=/path/to/memory

# Allowed prefixes for memory organization
MEMORY_ALLOWED_PREFIXES=knowledge,daily,memory

# Maximum memory depth for tree view
MEMORY_MAX_DEPTH=8

# Enable/disable features
NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH=true
NEXT_PUBLIC_ENABLE_WEB_SEARCH=true
NEXT_PUBLIC_ENABLE_MEMORY_TEMPLATES=true
NEXT_PUBLIC_ENABLE_ACTION_ITEMS=true
```

### Performance Configuration
```env
# Search caching
SEARCH_CACHE_TTL=300  # 5 minutes in seconds

# Pagination limits
SEARCH_RESULTS_LIMIT=20  # Default results per page
MAX_SEARCH_RESULTS=100   # Maximum results per query

# Lazy loading settings
TREE_LAZY_LOAD_THRESHOLD=50  # Files before lazy loading
```

### AI Features Configuration
```env
# AI model selection for analysis
AI_MODEL=claude-sonnet  # Options: claude-sonnet, gpt-4, local

# API keys for AI features
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Local AI (Ollama) configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

### Analytics Configuration
```env
# Search analytics
NEXT_PUBLIC_ENABLE_ANALYTICS=true

# Feature flags
NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH=true
NEXT_PUBLIC_ENABLE_WEB_SEARCH=true
```

## Configuration Files

### 1. `.env.example` (Additions)

```env
# Web Search
WEB_SEARCH_ENGINE=google
GOOGLE_CUSTOM_SEARCH_API_KEY=
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=
BING_SEARCH_API_KEY=

# Memory Settings
MEMORY_PATH=/.data/memory
MEMORY_MAX_DEPTH=8
MEMORY_ALLOWED_PREFIXES=knowledge,daily,memory

# Performance
SEARCH_CACHE_TTL=300
SEARCH_RESULTS_LIMIT=20
MAX_SEARCH_RESULTS=100

# AI Features
AI_MODEL=claude-sonnet
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OLLAMA_URL=http://localhost:11434

# Feature Flags
NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH=true
NEXT_PUBLIC_ENABLE_WEB_SEARCH=true
NEXT_PUBLIC_ENABLE_MEMORY_TEMPLATES=true
```

### 2. `config/memory.config.ts`

```typescript
export interface MemoryConfig {
  path: string;
  maxDepth: number;
  allowedPrefixes: string[];
  search: {
    cacheTTL: number;
    defaultLimit: number;
    maxLimit: number;
  };
  webSearch: {
    engine: 'google' | 'bing' | 'duckduckgo';
    apiKey?: string;
    engineId?: string;
  };
  ai: {
    model: string;
    enabled: boolean;
    apiUrl?: string;
  };
  features: {
    unifiedSearch: boolean;
    webSearch: boolean;
    templates: boolean;
    actionItems: boolean;
    entityExtraction: boolean;
  };
}

export const defaultMemoryConfig: MemoryConfig = {
  path: process.env.MEMORY_PATH || '.data/memory',
  maxDepth: Number.parseInt(process.env.MEMORY_MAX_DEPTH || '8', 10),
  allowedPrefixes: (process.env.MEMORY_ALLOWED_PREFIXES || 'knowledge,daily,memory').split(','),
  search: {
    cacheTTL: Number.parseInt(process.env.SEARCH_CACHE_TTL || '300', 10),
    defaultLimit: Number.parseInt(process.env.SEARCH_RESULTS_LIMIT || '20', 10),
    maxLimit: Number.parseInt(process.env.MAX_SEARCH_RESULTS || '100', 10),
  },
  webSearch: {
    engine: (process.env.WEB_SEARCH_ENGINE as any) || 'google',
    apiKey: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.BING_SEARCH_API_KEY,
    engineId: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
  },
  ai: {
    model: process.env.AI_MODEL || 'claude-sonnet',
    enabled: !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY,
    apiUrl: process.env.OLLAMA_URL,
  },
  features: {
    unifiedSearch: process.env.NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH !== 'false',
    webSearch: process.env.NEXT_PUBLIC_ENABLE_WEB_SEARCH !== 'false',
    templates: true,
    actionItems: true,
    entityExtraction: true,
  },
};

export function getMemoryConfig(): MemoryConfig {
  return {
    ...defaultMemoryConfig,
    path: process.env.MEMORY_PATH || defaultMemoryConfig.path,
  };
}
```

### 3. Feature Flags System

```typescript
// src/lib/features.ts
export interface FeatureFlags {
  unifiedSearch: boolean;
  webSearch: boolean;
  templates: boolean;
  actionItems: boolean;
  entityExtraction: boolean;
  versionHistory: boolean;
  searchAnalytics: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    unifiedSearch: process.env.NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH !== 'false',
    webSearch: process.env.NEXT_PUBLIC_ENABLE_WEB_SEARCH !== 'false',
    templates: true,  // Always enabled, no config needed
    actionItems: true,
    entityExtraction: true,
    versionHistory: process.env.NEXT_PUBLIC_ENABLE_VERSION_HISTORY !== 'false',
    searchAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS !== 'false',
  };
}
```

## API Rate Limiting

### Memory Search Rate Limits
```typescript
// src/lib/rate-limit.ts
export const memorySearchRateLimit = {
  windowMs: 60 * 1000,  // 1 minute
  max: 100,  // 100 requests per minute
};

export const webSearchRateLimit = {
  windowMs: 60 * 1000,
  max: 30,  // 30 web searches per minute
};

export const unifiedSearchRateLimit = {
  windowMs: 60 * 1000,
  max: 50,
};
```

## Database Configuration

### SQLite PRAGMA Settings
```typescript
// src/lib/db.ts
const db = new Database(MEMORY_PATH, {
 verbose: process.env.NODE_ENV === 'development',
  fileOpenFlags: 'READCREATE',
});

db.pragma(`journal_mode = WAL`);
db.pragma(`synchronous = NORMAL`);
db.pragma(`cache_size = -64000`);  // 64MB cache
db.pragma(`temp_store = MEMORY`);
db.pragma(`cache_spill = 1`);
```

### Index Optimization
```sql
-- Enable full-text search optimizations
PRAGMA fts5_tokenizer = 'porter';
PRAGMA fts5_case_sensitive = 'OFF';
```

## Build Configuration

### next.config.js (Additions)
```javascript
const nextConfig = {
  env: {
    WEB_SEARCH_ENGINE: process.env.WEB_SEARCH_ENGINE,
    GOOGLE_CUSTOM_SEARCH_API_KEY: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
    BING_SEARCH_API_KEY: process.env.BING_SEARCH_API_KEY,
    MEMORY_PATH: process.env.MEMORY_PATH,
    AI_MODEL: process.env.AI_MODEL,
  },
};

module.exports = nextConfig;
```

## Security Configuration

### Allowed APIs
```typescript
// src/lib/security.ts
export const ALLOWED_WEB_SEARCH_ENGINES = ['google', 'bing', 'duckduckgo'];

export function validateWebSearchEngine(engine: string): boolean {
  return ALLOWED_WEB_SEARCH_ENGINES.includes(engine);
}

export function sanitizeSearchQuery(query: string): string {
  // Remove potentially dangerous characters
  return query.replace(/[<>{}[\]|\\;`$]/g, '');
}
```

### CORS Configuration
```typescript
// If web search involves external APIs
export const WEB_SEARCH_API_ENDPOINTS = {
  google: 'https://www.googleapis.com/customsearch/v1',
  bing: 'https://api.bing.microsoft.com/v7.0/search',
  duckduckgo: 'https://html.duckduckgo.com/html',
};
```

## Testing Configuration

### Integration Test Setup
```typescript
// vitest.config.ts
export default defineConfig({
  environment: 'node',
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});

// Test fixtures for memory features
// Add to test/fixtures/memory.ts
```

## Deployment Configuration

### Production Settings
```env
# Disable debug features in production
NEXT_PUBLIC_DEBUG_MODE=false

# Enable production optimizations
NEXT_PUBLIC_ENABLE_CACHING=true
NEXT_PUBLIC_ENABLE_COMPRESSION=true

# API timeouts (milliseconds)
SEARCH_API_TIMEOUT=30000
WEB_SEARCH_API_TIMEOUT=10000
```

### Docker Configuration
```dockerfile
# Add to Dockerfile
ENV MEMORY_PATH=/app/.data/memory
ENV WEB_SEARCH_ENGINE=google
ENV SEARCH_RESULTS_LIMIT=20
ENV MAX_SEARCH_RESULTS=100

# Expose config
RUN echo "MEMORY_PATH=$MEMORY_PATH" >> /app/.env
RUN echo "WEB_SEARCH_ENGINE=$WEB_SEARCH_ENGINE" >> /app/.env
```

## Development Environment

### Local Development Settings
```env
# Enable all features locally
NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH=true
NEXT_PUBLIC_ENABLE_WEB_SEARCH=true

# Use local AI for testing
OLLAMA_URL=http://localhost:11434
AI_MODEL=llama3
```

### Debug Flags
```typescript
// src/lib/debug.ts
export function isDebugMode(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';
}

export function debugLog(message: string, data?: any) {
  if (isDebugMode()) {
    console.log(`[DEBUG] ${message}`, data);
  }
}
```

## Rollout Plan

### Phase 1: Enable Core Features
1. **Unified Search**: `NEXT_PUBLIC_ENABLE_UNIFIED_SEARCH=true`
2. **Search Improvements**: FTS5 enhancements
3. **Lazy Loading**: Tree optimization

### Phase 2: Add Web Integration
4. **Web Search Sidebar**: Configure API keys
5. **Caching**: Implement result caching

### Phase 3: Advanced Features
6. **Templates**: Enable memory templates
7. **Action Items**: Add TODO extraction

### Phase 4: Analytics & AI
8. **Search Analytics**: Track usage
9. **AI Features**: Enable advanced analysis

## Monitoring & Logging

### Key Metrics to Track
```typescript
// src/lib/metrics.ts
export interface MemoryMetrics {
  searchRequests: number;
  webSearchRequests: number;
  averageSearchTime: number;
  cacheHitRate: number;
  uniqueQueries: number;
  popularFiles: string[];
}
```

### Logging Configuration
```typescript
// src/lib/logger.ts
export const memoryLogger = createLogger('memory', {
  level: process.env.MEMORY_LOG_LEVEL || 'info',
  format: 'json',
  includeContext: true,
});
```

## Configuration Validation

### Runtime Validation
```typescript
// src/lib/config-validation.ts
export function validateMemoryConfig(): void {
  const errors = [];

  if (!process.env.MEMORY_PATH) {
    errors.push('MEMORY_PATH is required');
  }

  if (process.env.WEB_SEARCH_ENGINE && !validateWebSearchEngine(process.env.WEB_SEARCH_ENGINE)) {
    errors.push(`Invalid WEB_SEARCH_ENGINE: ${process.env.WEB_SEARCH_ENGINE}`);
  }

  if (errors.length > 0) {
    throw new Error(`Memory configuration errors:\n${errors.join('\n')}`);
  }
}
```
