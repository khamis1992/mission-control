# API Endpoints Plan - Memory Feature Enhancement

## New API Endpoints

### 1. Unified Search
```
GET /api/search/unified?q=term&limit=20&offset=0
```
**Purpose**: Search across both tasks and memory files
**Query Parameters**:
- `q` - Search query
- `limit` - Results per page (default 20, max 100)
- `offset` - Pagination offset (default 0)
- `type` - Filter by type: all|task|memory

**Response**:
```json
{
  "query": "term",
  "results": [
    {
      "type": "task",
      "id": 123,
      "title": "Task title",
      "score": 0.92,
      "priority": "high"
    },
    {
      "type": "memory",
      "path": "knowledge/notes.md",
      "title": "Notes",
      "snippet": "Content snippet with ...",
      "rank": 0.88
    }
  ],
  "total": 150,
  "page": 1,
  "pages": 8
}
```

**Priority**: High
**Implementation**: `src/app/api/search/unified/route.ts`

---

### 2. Memory Templates
```
GET /api/memory/templates?folder=knowledge/templates
GET /api/memory/templates?name=task-template
POST /api/memory/templates
PUT /api/memory/templates
DELETE /api/memory/templates/:name
```
**Purpose**: Manage reusable task templates in memory
**Features**:
- List templates
- Get specific template
- Create/update template
- Delete template

**Priority**: Medium
**Implementation**: `src/app/api/memory/templates/route.ts`

---

### 3. Entity Extraction
```
POST /api/memory/entities
```
**Request**:
```json
{
  "content": "Document content to analyze",
  "files": ["path/to/file1.md", "path/to/file2.md"]
}
```
**Response**:
```json
{
  "entities": [
    {
      "type": "person",
      "text": "John Doe",
      "count": 5
    },
    {
      "type": "date",
      "text": "2024-01-15",
      "count": 3
    }
  ],
  "relationships": [
    {
      "entity1": "John Doe",
      "entity2": "Project Alpha",
      "relation": "leads"
    }
  ]
}
```
**Priority**: Medium
**Implementation**: `src/app/api/memory/entities/route.ts`

---

### 4. Memory Action Items
```
GET /api/memory/action-items?file=knowledge/notes.md
```
**Purpose**: ExtractTODO items, deadlines, action items from memory
**Response**:
```json
{
  "file": "knowledge/notes.md",
  "actionItems": [
    {
      "text": "Review Q1 report",
      "line": 42,
      "due": "2024-02-01",
      "priority": "medium"
    }
  ],
  "deadlines": [
    {
      "text": "Submit proposal",
      "due": "2024-01-31"
    }
  ]
}
```
**Priority**: Medium
**Implementation**: `src/app/api/memory/action-items/route.ts`

---

### 5. Memory Version History
```
GET /api/memory/history?file=knowledge/notes.md&limit=10
```
**Purpose**: Track changes to memory files over time
**Response**:
```json
{
  "file": "knowledge/notes.md",
  "versions": [
    {
      "version": 1,
      "timestamp": 1234567890,
      "author": "user",
      "changes": 42
    }
  ]
}
```
**Priority**: Medium
**Implementation**: `src/app/api/memory/history/route.ts`

---

### 6. Web Search Integration
```
GET /api/search/web?q=query&engine=google
```
**Purpose**: Quick web search while viewing memory
**Query Parameters**:
- `q` - Search query
- `engine` - Search engine: google|bing|duckduckgo
- `limit` - Results count (default 10)

**Response**:
```json
{
  "query": "query",
  "engine": "google",
  "results": [
    {
      "title": "Result title",
      "url": "https://example.com",
      "snippet": "Content summary"
    }
  ]
}
```
**Priority**: High
**Implementation**: `src/app/api/search/web/route.ts`
**Configuration**:
- `WEB_SEARCH_ENGINE` - Which engine to use
- `WEB_SEARCH_API_KEY` - API key for selected engine

---

### 7. Related Memory Suggestions
```
GET /api/memory/suggestions?file=knowledge/notes.md&limit=5
```
**Purpose**: Find related memory files based on content
**Response**:
```json
{
  "file": "knowledge/notes.md",
  "related": [
    {
      "path": "knowledge/design.md",
      "title": "Design Document",
      "score": 0.85,
      "linkCount": 3
    }
  ]
}
```
**Priority**: Medium
**Implementation**: `src/app/api/memory/suggestions/route.ts`

---

### 8. Search Statistics
```
GET /api/search/stats
```
**Purpose**: Analytics on search usage and popular content
**Response**:
```json
{
  "totalSearches": 1250,
  "popularTerms": [
    { "term": "architecture", "count": 150 },
    { "term": "api", "count": 120 }
  ],
  "mostViewedFiles": [
    { "path": "knowledge/readme.md", "views": 500 }
  ],
  "noResultsQueries": ["nonexistent term", "typo"]
}
```
**Priority**: Low
**Implementation**: `src/app/api/search/stats/route.ts`

---

## Modified Endpoints

### Existing: `/api/memory`
**Add**:
- Support for templates (`?action=templates`)
- Enhanced search with filters

### Existing: `/api/memory/search`
**Add**:
- `filter[]` parameter (file type, date range)
- `category` parameter for entity-based filtering

---

## Endpoint Priority Matrix

| Priority | Endpoints |
|----------|-----------|
| High (Week 1-2) | unified, web, memory/templates |
| High (Week 3-4) | memory/action-items, search/stats |
| Medium | memory/entities, memory/history, memory/suggestions |

---

## Implementation Order

**Week 1-2 (Foundation)**:
1. `/api/memory/templates` - Quick win, enables templates
2. `/api/search/web` - Web integration, good UX improvement

**Week 3-4 (Core Search)**:
3. `/api/search/unified` - Combined tasks + memory
4. `/api/memory/action-items` - Extract TODOs from memory

**Week 5-6 (Intelligence)**:
5. `/api/memory/entities` - Analyze content
6. `/api/memory/history` - Track changes

**Week 7-8 (Analytics)**:
7. `/api/search/stats` - Measure usage
8. `/api/memory/suggestions` - Recommend related content
