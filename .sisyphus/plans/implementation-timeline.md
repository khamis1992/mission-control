# Memory Feature Enhancement - Implementation Timeline

## Week 1-2: Foundation & Performance

### Days 1-2: Setup & Infrastructure
- [ ] Create `.sisyphus/plans/` directory structure
- [ ] Set up environment variables for testing
- [ ] Configure build for dev mode
- [ ] Run `pnpm dev` and verify memory page loads
- [ ] Check type errors with `pnpm typecheck`

### Days 3-4: Performance Optimizations
**Task 7.2 - Lazy Loading Tree**
- [ ] Modify tree rendering in `memory-browser-panel.tsx`
- [ ] Implement only fetch immediate children initially
- [ ] Add expand/collapse loading states
- [ ] Test with large directories (1000+ files)

**Task 7.1 - Incremental Indexing**
- [ ] Track file modification times in database
- [ ] Update `rebuildIndex()` to only re-index changed files
- [ ] Add background re-index option
- [ ] Measure indexing time improvement

### Days 5-7: Search Improvements
**Task 7.4 - Pagination**
- [ ] Add page parameter to search API endpoints
- [ ] Implement LIMIT/OFFSET in database queries
- [ ] Add pagination controls to UI
- [ ] Test with 100+ results

**Task 1.5 - FTS5 Improvements**
- [ ] Adjust BM25 parameters in `memory-search.ts`
- [ ] Better snippet extraction (more context)
- [ ] Test FTS5 syntax: `AND`, `OR`, `NEAR`, `"phrase"`
- [ ] Add search result grouping by folder

---

## Week 3-4: Unified Search & Web Integration

### Days 1-2: Unified Search Backend
**Task 1.1 - Unified Search API**
- [ ] Create `/api/search/unified/route.ts`
- [ ] Query tasks table for matches
- [ ] Query memory_fts for content matches
- [ ] Merge and rank results
- [ ] Test API with various queries

### Days 3-4: Unified Search Frontend
- [ ] Add unified search bar to memory header
- [ ] Display results with tabs: All, Tasks, Memory
- [ ] Implement result卡片 UI
- [ ] Add search history integration

### Days 5-7: Web Search Sidebar
**Task 1.2 - Web Search Integration**
- [ ] Choose web search engine (Google/Bing/DuckDuckGo)
- [ ] Set up API credentials
- [ ] Create `/api/search/web/route.ts`
- [ ] Build `web-search-sidebar.tsx` component
- [ ] Add sidebar toggle in memory panel

---

## Week 5-6: Task Integration

### Days 1-2: Memory→Task Linking
**Task 2.1 - Create Task from Memory**
- [ ] Add context menu to memory files
- [ ] Create `create-task-modal.tsx` integration
- [ ] Extract memory title as task title
- [ ] Include memory content as task description
- [ ] Add backlink to memory

**Task 2.5 - Double-Click Task Creation**
- [ ] Modify link click handler
- [ ] Pre-fill task modal with memory data
- [ ] Add template selection
- [ ] Auto-assign based on context

### Days 3-4: Task Detail Display
**Task 2.2 - Embedded Memory Content**
- [ ] Parse `[[link]]` syntax in task descriptions
- [ ] Fetch linked memory content
- [ ] Add expand/collapse for embedded content
- [ ] Handle missing links gracefully

### Days 5-7: Templates
**Task 2.3 - Memory Templates**
- [ ] Create `/api/memory/templates/route.ts`
- [ ] Create `/memory/templates/` directory
- [ ] Build template editor UI
- [ ] Support variables: `{{today}}`, `{{agent}}`
- [ ] Add template versioning

---

## Week 7-8: Advanced Features & Analytics

### Days 1-2: Action Items Extraction
**Task 4.4 - TODO Detection**
- [ ] Analyze memory files for TODO patterns
- [ ] Extract due dates, priorities
- [ ] Create action items table
- [ ] Add "convert to task" button

**Task 3.1 - Entity Extraction**
- [ ] Parse memory for people, dates, organizations
- [ ] Store in `memory_entities` table
- [ ] Build relationship graph
- [ ] Add entity sidebar

### Days 3-4: Version History
**Task 5.1 - File Versioning**
- [ ] Track changes in `memory_versions` table
- [ ] Store content hashes
- [ ] Build version UI
- [ ] Add rollback capability

**Task 5.2 - Comments**
- [ ] Create comments table
- [ ] Add inline comment UI
- [ ] Implement comment threads
- [ ] Add comment notifications

### Days 5-7: Search Analytics
**Task 9.1 - Usage Tracking**
- [ ] Track search queries in `search_history` table
- [ ] Log popular files, click-through rates
- [ ] Build admin analytics dashboard
- [ ] Add no-results query tracking

**Task 8.1 - External Resources**
- [ ] Create link management table
- [ ] Store external URLs from memory
- [ ] Build link checker
- [ ] Add resource library view

---

##Week 8: Testing & Polish

### Days 1-2: Integration Testing
- [ ] Test unified search with realistic data
- [ ] Test web search with various engines
- [ ] Test task→memory links
- [ ] Test templates for different use cases

### Days 3-4: Performance Testing
- [ ] Profile memory page render
- [ ] Test lazy loading with 1000+ files
- [ ] Measure search response times
- [ ] Optimize slow queries

### Days 5-6: Bug Fixes
- [ ] Fix type errors
- [ ] Resolve console warnings
- [ ] Fix edge cases in search
- [ ] Handle API failures gracefully

### Days 7-8: Documentation
- [ ] Write user guide for new features
- [ ] Document configuration options
- [ ] Create developer docs
- [ ] Add inline code comments

---

## Quick Wins (Implement First)

### Priority 1: Search Improvements (Week 1)
1. Incremental FTS indexing
2. Pagination for results
3. Better snippets/highlighting

### Priority 2: Unified Search (Week 2)
4. Backend endpoint
5. Frontend integration

### Priority 3: Task Linking (Week 3)
6. Context menu for task creation
7. Double-click task creation

---

## Rollout Strategy

### Phase 1: Internal Testing (Weeks 1-3)
- [ ] Enable on test database
- [ ] Test with 100 files
- [ ] Gather internal feedback

### Phase 2: Public Release (Week 4)
- [ ] Enable on production
- [ ] Monitor errors
- [ ] Scale gradually

### Phase 3: Feature Rollout (Weeks 5-8)
- [ ] Enable features incrementally
- [ ] Update documentation
- [ ] Gather user feedback

---

## RiskMitigation

| Risk | Mitigation |
|------|------------|
| Performance degradation | Rollback to previous version |
| API costs (web search) | Rate limiting + caching |
| Data loss | Backup before migration |
| User confusion | Feature flags + documentation |
