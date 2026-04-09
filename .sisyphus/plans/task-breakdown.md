# Task Breakdown: Memory Feature Enhancement

## Phase 1: Core Search Enhancements

### 1.1 Unified Search Across Tasks and Memory

**Goal**: Single search bar that searches both tasks and memory files

**Tasks**:
- [ ] Create `/api/search/unified` endpoint
- [ ] Query tasks table for title/description matches
- [ ] Query memory_fts for file content matches
- [ ] Merge and rank results by relevance
- [ ] Add UI search bar in memory panel header
- [ ] Display results from both sources
- [ ] Add tabs: "All", "Tasks", "Memory"

**Files to Create**:
- `src/app/api/search/unified/route.ts`
- Add search bar to `memory-browser-panel.tsx`

**Files to Modify**:
- `memory-browser-panel.tsx` - Add unified search UI
- Add search result components

---

### 1.2 Web Search Sidebar

**Goal**: Quick internet search while viewing memory content

**Tasks**:
- [ ] Add search sidebar panel to memory browser
- [ ] Integrate web search API (Google Custom Search, Bing, or DuckDuckGo)
- [ ] Add search query input
- [ ] Display search results as links
- [ ] Support opening results in new tab
- [ ] Cache recent searches

**API Options**:
- Google Custom Search JSON API
- Bing Search API
- DuckDuckGo Instant Answer API

**Files to Create**:
- `src/components/panels/web-search-sidebar.tsx`
- `src/lib/web-search-client.ts`

**Configuration**:
- Add env vars: `WEB_SEARCH_ENGINE`, `WEB_SEARCH_API_KEY`

---

### 1.3 Search Filters

**Goal**: Filter search results by type, date, tags

**Tasks**:
- [ ] Add filter dropdown in memory search
- [ ] File type filter: md, json, txt, log
- [ ] Date range filter: last 24h, 7d, 30d, all time
- [ ] Access tag system from memory metadata
- [ ] User/agent filter by creator
- [ ] Store filters in URL state

**Files to Modify**:
- `memory-browser-panel.tsx` - Add filter UI
- Add filter parsing logic

---

### 1.4 Search History & Suggestions

**Goal**: Remember past searches and show similar queries

**Tasks**:
- [ ] Store search history in localStorage
- [ ] Show recent searches on click
- [ ] Implement autocomplete from indexed content
- [ ] Add "Did you mean?" for typos
- [ ] Track popular searches for analytics

**Files to Create**:
- `src/lib/search-history.ts`

**Files to Modify**:
- `memory-browser-panel.tsx` - Add history display

---

### 1.5 FTS5 Improvements

**Goal**: Better search quality and ranking

**Tasks**:
- [ ] Adjust BM25 parameters for better recall
- [ ] Add phrase search with NEAR operator
- [ ] Implement fuzzy matching for typos
- [ ] Add stemming customization
- [ ] Highlight search terms with more context
- [ ] Add search result grouping by folder

**Files to Modify**:
- `src/lib/memory-search.ts` - Search logic
- `memory-browser-panel.tsx` - Results display

---

## Phase 2: Task Integration

### 2.1 Memory→Task Linking

**Goal**: Click memory file to create task

**Tasks**:
- [ ] Add context menu "Create Task from Memory"
- [ ] Extract memory title as task title
- [ ] Include memory content as task description
- [ ] Add link back to memory file in task
- [ ] Support bulk task creation from multiple files

**Files to Modify**:
- `memory-browser-panel.tsx` - Context menu
- `memory-panel.tsx` - Task detail modal

---

### 2.2 Memory Content Embedding

**Goal**: Automatically include linked memory in task

**Tasks**:
- [ ] Parse memory links in task descriptions
- [ ] Fetch and embed linked memory content
- [ ] Add expand/collapse for embedded content
- [ ] Refresh embedded content on memory update
- [ ] Support live updating (WebSocket)

**Files to Modify**:
- `memory-browser-panel.tsx` - Link parsing
- `task-board-panel.tsx` - Display embedded memory

---

### 2.3 Memory Templates

**Goal**: Reusable task templates stored in memory

**Tasks**:
- [ ] Create `/memory/templates/` folder structure
- [ ] Build template editor in memory panel
- [ ] Add template selection when creating tasks
- [ ] Support variables in templates (`{{today}}`, `{{agent}}`)
- [ ] Add template versioning

**Files to Create**:
- `src/app/api/memory/templates/route.ts`

**Files to Modify**:
- `memory-browser-panel.tsx` - Template UI

---

### 2.4 Context-Aware Task Suggestions

**Goal**: Suggest related tasks based on memory content

**Tasks**:
- [ ] Analyze memory file metadata for task patterns
- [ ] Extract dates, action items, owners
- [ ] Create task suggestions sidebar
- [ ] Display confidence score for suggestions
- [ ] Allow quick creation with one click

**Files to Create**:
- `src/lib/task-suggestions.js` - Analysis logic

**Files to Modify**:
- `memory-browser-panel.tsx` - Suggestion UI

---

### 2.5 Double-Click Task Creation

**Goal**: Create task from memory link interaction

**Tasks**:
- [ ] On double-click of memory link, open create task modal
- [ ] Pre-fill with memory file name and path
- [ ] Add task type selection (normal, subtask, mission)
- [ ] Auto-assign based on current context
- [ ] Add template dropdown

**Files to Modify**:
- `memory-browser-panel.tsx` - Link click handler

---

## Phase 7: Performance Improvements

### 7.1 Incremental FTS Index Updates

**Goal**: Don't rebuild index on every save

**Tasks**:
- [ ] Track last index state per file
- [ ] Update only modified files
- [ ] Use SQLite transactions for atomic updates
- [ ] Add background rebuild option
- [ ] Measure indexing performance

**Files to Modify**:
- `src/lib/memory-search.ts` - Index management
- `src/app/api/memory/route.ts` - File save hook

---

### 7.2 Lazy Loading Tree

**Goal**: Load children only when folders expand

**Tasks**:
- [ ] Only fetch immediate children initially
- [ ] Load grand-children on expand
- [ ] Cache expanded folder states
- [ ] Add loading indicator
- [ ] Implement infinite scroll for large directories

**Files to Modify**:
- `memory-browser-panel.tsx` - Tree rendering
- `src/app/api/memory/route.ts` - Add depth parameter

---

### 7.3 Search Result Caching

**Goal**: Speed up repeated searches

**Tasks**:
- [ ] Cache recent search results (in-memory + localStorage)
- [ ] Add cache TTL (5 minutes)
- [ ] Clear cache on memory updates
- [ ] Show cached label on results
- [ ] Add cache refresh button

**Files to Create**:
- `src/lib/search-cache.ts`

**Files to Modify**:
- `memory-browser-panel.tsx` - Cache integration

---

### 7.4 Pagination

**Goal**: Handle large result sets efficiently

**Tasks**:
- [ ] Add pagination controls to search results
- [ ] Limit initial results (20 per page)
- [ ] Implement "Load more" button
- [ ] Add page state to URL
- [ ]Optimize database query with OFFSET/LIMIT

**Files to Modify**:
- `memory-browser-panel.tsx` - Results display
- `src/app/api/memory/search/route.ts` - Add limit parameter

---

### 7.5 Render Optimization

**Goal**: Faster rendering for large trees

**Tasks**:
- [ ] Virtualize tree list (only render visible items)
- [ ] Debounce expand/collapse actions
- [ ] Add virtual scrolling for long lists
- [ ] Optimize React re-renders
- [ ] Profile render performance

**Files to Modify**:
- `memory-browser-panel.tsx` - Tree rendering

---

## Priority 1 Implementation Order

### Sprint 1 (Week 1-2): Foundation
1. Phase 7.1 - Incremental FTS indexing (enables scaling)
2. Phase 7.2 - Lazy loading (enables large trees)
3. Phase 1.3 - Search filters (immediate UX improvement)

### Sprint 2 (Week 3-4): Search Enhancement
4. Phase 1.1 - Unified search (key feature)
5. Phase 1.5 - FTS5 improvements (quality)
6. Phase 1.2 - Web search sidebar (integration)

### Sprint 3 (Week 5-6): Task Integration
7. Phase 2.1 - Memory→task linking (workflow)
8. Phase 2.5 - Double-click task creation (UX)
9. Phase 7.4 - Pagination (enables scale)

### Sprint 4 (Week 7-8): Polish
10. Phase 7.3 - Search caching (performance)
11. Phase 1.4 - Search history (UX)
12. Phase 2.3 - Templates (usability)

---

## Summary

**Total Features**: 12 major features across 4 priority categories

**Estimated Effort**: 8 weeks of development

**Key Dependencies**:
- Phase 7 (Performance) must come before large-scale testing
- Phase 1.1 (Unified Search) requires backend endpoint first
- Phase 2 (Task Integration) builds on Phase 1 search features
