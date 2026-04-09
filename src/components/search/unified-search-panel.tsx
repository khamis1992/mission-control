'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'

type LinkContext = 'created_from' | 'referenced_in' | 'context_file' | 'result_file' | 'learned_from'

interface UnifiedSearchResult {
  query: string
  memory: {
    results: Array<{
      path: string
      title: string
      snippet: string
      rank: number
      task_id?: number | null
      link_context?: LinkContext | null
    }>
    total: number
    indexedFiles: number
    indexedAt: string | null
    contextCounts?: Record<LinkContext, number>
  }
  tasks: {
    query: string
    results: Array<{ 
      id: number
      title: string
      description: string | null
      status: string
      priority: string
      project_id: number | null
      project_name: string | null
      ticket_ref: string | null
      assigned_to: string | null
      created_at: number
      score: number
      link_context?: LinkContext | null 
    }>
    total: number
    page: number
    limit: number
    contextCounts?: Record<LinkContext, number>
  }
  total: number
  contextCounts?: Record<LinkContext, { memory: number; tasks: number }>
}

const CONTEXT_LABELS: Record<LinkContext, { label: string; description: string }> = {
  created_from: { label: 'Created From', description: 'Memory files that created tasks' },
  referenced_in: { label: 'Referenced In', description: 'Memory referenced by tasks' },
  context_file: { label: 'Context File', description: 'Context files for tasks' },
  result_file: { label: 'Result File', description: 'Task output/result files' },
  learned_from: { label: 'Learned From', description: 'Knowledge learned from tasks' },
}

export function UnifiedSearchPanel() {
  const t = useTranslations('unifiedSearch')
  const searchParams = useSearchParams()
  const router = useRouter()

  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'memory'>('all')
  const [activeContext, setActiveContext] = useState<LinkContext | null>(
    (searchParams.get('link_context') as LinkContext) || null
  )
  const [limit] = useState(20)
  const [offset, setOffset] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    const urlContext = searchParams.get('link_context') as LinkContext | null
    const urlQuery = searchParams.get('q') || ''
    if (urlContext !== activeContext || urlQuery !== query) {
      setActiveContext(urlContext)
      setQuery(urlQuery)
    }
  }, [searchParams])

  const performSearch = useCallback(async (searchQuery: string, newLimit: number, newOffset: number, contextFilter: LinkContext | null) => {
    if (!searchQuery.trim() && !contextFilter) {
      setSearchResults(null)
      setHasSearched(false)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('q', searchQuery)
      params.set('limit', String(newLimit))
      params.set('offset', String(newOffset))
      if (contextFilter) params.set('link_context', contextFilter)

      const response = await fetch(`/api/search/unified?${params.toString()}`)
      const data = await response.json()
      setSearchResults(data)
      setHasSearched(true)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setOffset(0)
    
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (activeContext) params.set('link_context', activeContext)
    router.push(`?${params.toString()}`)
    
    performSearch(query, limit, 0, activeContext)
  }, [query, limit, activeContext, performSearch, router])

  const handleContextChange = useCallback((context: LinkContext | null) => {
    setActiveContext(context)
    setOffset(0)
    
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (context) params.set('link_context', context)
    router.push(`?${params.toString()}`)
    
    performSearch(query, limit, 0, context)
  }, [query, limit, performSearch, router])

  const handleLoadMore = useCallback(() => {
    const newOffset = offset + limit
    setOffset(newOffset)
    performSearch(query, limit, newOffset, activeContext)
  }, [query, limit, offset, activeContext, performSearch])

  const totalContextCounts = searchResults?.contextCounts

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-[hsl(var(--surface-0))]">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder')}
            className="flex-1 px-3 py-2 text-xs font-mono bg-[hsl(var(--surface-1))] border border-border/50 rounded text-foreground placeholder-muted-foreground/40 focus:outline-none focus:border-primary/30"
          />
          <Button type="submit" disabled={isLoading || (!query.trim() && !activeContext)} size="sm" className="font-mono">
            {isLoading ? <Loader variant="inline" /> : t('search')}
          </Button>
        </form>
        {searchResults?.memory.indexedAt && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/40 font-mono">
            <span>Memory indexed:</span>
            <span>{new Date(searchResults.memory.indexedAt).toLocaleTimeString()}</span>
            <span>(</span>
            <span>{searchResults.memory.indexedFiles} files)</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {hasSearched && totalContextCounts && (
          <div className="w-48 border-r border-border bg-[hsl(var(--surface-0))] p-3 overflow-auto">
            <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-2">
              Filter by Context
            </div>
            <div className="space-y-1">
              <button
                onClick={() => handleContextChange(null)}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${
                  activeContext === null
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-[hsl(var(--surface-2))] hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>All contexts</span>
                  <span className="text-[10px] opacity-60">
                    {Object.values(totalContextCounts).reduce((sum, c) => sum + c.memory + c.tasks, 0)}
                  </span>
                </div>
              </button>
              {(Object.keys(CONTEXT_LABELS) as LinkContext[]).map((ctx) => {
                const counts = totalContextCounts[ctx]
                const total = (counts?.memory || 0) + (counts?.tasks || 0)
                if (total === 0) return null
                
                return (
                  <button
                    key={ctx}
                    onClick={() => handleContextChange(ctx)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${
                      activeContext === ctx
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-[hsl(var(--surface-2))] hover:text-foreground'
                    }`}
                    title={CONTEXT_LABELS[ctx].description}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span>{CONTEXT_LABELS[ctx].label}</span>
                        <span className="text-[10px] opacity-60">{total}</span>
                      </div>
                      <div className="text-[9px] opacity-50 flex gap-2">
                        <span>{counts?.memory || 0} mem</span>
                        <span>{counts?.tasks || 0} tasks</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {!hasSearched ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30">
              <span className="text-4xl font-mono mb-3">/</span>
              <span className="text-sm font-mono">{t('noSearchYet')}</span>
              <span className="text-xs font-mono mt-1">Search tasks + memory files</span>
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-4">
                {(['all', 'tasks', 'memory'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded text-[11px] font-mono transition-colors capitalize ${
                      activeTab === tab ? 'bg-[hsl(var(--surface-2))] text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
                {activeTab === 'all' && (
                  <span className="text-[10px] text-muted-foreground/40 font-mono">
                    {searchResults?.total} results
                  </span>
                )}
              </div>

              {activeTab === 'all' && searchResults && (
                <>
                  {searchResults.tasks.total > 0 && (
                    <div className="mb-6">
                      <div className="text-xs font-mono text-muted-foreground/50 mb-2 flex items-center gap-2">
                        <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">{searchResults.tasks.total}</span>
                        <span>Tasks</span>
                      </div>
                      {searchResults.tasks.results.map((task) => (
                        <div key={task.id} className="bg-[hsl(var(--surface-1))] border border-border/50 rounded-lg p-3 mb-2 hover:border-primary/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">
                              #{task.ticket_ref || task.id}
                            </span>
                            <span className={`text-[9px] font-mono px-1 rounded ${
                              task.priority === 'high' ? 'bg-red-500/10 text-red-400/80' :
                              task.priority === 'medium' ? 'bg-amber-500/10 text-amber-400/80' :
                              'bg-green-500/10 text-green-400/80'
                            }`}>
                              {task.priority}
                            </span>
                            <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                              {task.status}
                            </span>
                            {task.link_context && (
                              <span className="text-[8px] font-mono bg-blue-500/10 text-blue-400/80 px-1 rounded">
                                {CONTEXT_LABELS[task.link_context].label}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold font-mono text-foreground mb-1 truncate">
                            {task.title}
                          </h3>
                          {task.description && (
                            <p className="text-[11px] font-mono text-foreground/70 line-clamp-2 mb-2">
                              {task.description}
                            </p>
                          )}
                          {task.project_name && (
                            <div className="text-[10px] font-mono text-muted-foreground/50">
                              <span className="text-primary/60 mr-1">{task.project_name}</span>
                              {task.ticket_ref && ` - Ticket ${task.ticket_ref}`}
                            </div>
                          )}
                          {task.assigned_to && (
                            <div className="text-[10px] font-mono text-muted-foreground/40 mt-1">
                              Assigned: {task.assigned_to}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.memory.total > 0 && (
                    <div className="mb-6">
                      <div className="text-xs font-mono text-muted-foreground/50 mb-2 flex items-center gap-2">
                        <span className="text-[10px] bg-purple-500/10 text-purple-400/80 px-1 rounded">{searchResults.memory.total}</span>
                        <span>Memory Files</span>
                      </div>
                      {searchResults.memory.results.map((mem, i) => (
                        <div key={i} className="bg-[hsl(var(--surface-1))] border border-border/50 rounded-lg p-3 mb-2 hover:border-primary/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold font-mono text-foreground flex-1 truncate">
                              {mem.title}
                            </h3>
                            {mem.link_context && (
                              <span className="text-[8px] font-mono bg-blue-500/10 text-blue-400/80 px-1 rounded">
                                {CONTEXT_LABELS[mem.link_context].label}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground/60 mb-2">
                            {mem.path}
                          </div>
                          <div className="text-[11px] font-mono text-foreground/70 line-clamp-3">
                            {mem.snippet}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground/40 mt-2 flex justify-between">
                            <span>Rank: {Math.round(mem.rank)}</span>
                            {mem.task_id && <span>Task #{mem.task_id}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'tasks' && searchResults?.tasks.results.map((task) => (
                <div key={task.id} className="bg-[hsl(var(--surface-1))] border border-border/50 rounded-lg p-3 mb-2 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">
                      #{task.ticket_ref || task.id}
                    </span>
                    <span className={`text-[9px] font-mono px-1 rounded ${
                      task.priority === 'high' ? 'bg-red-500/10 text-red-400/80' :
                      task.priority === 'medium' ? 'bg-amber-500/10 text-amber-400/80' :
                      'bg-green-500/10 text-green-400/80'
                    }`}>
                      {task.priority}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                      {task.status}
                    </span>
                    {task.link_context && (
                      <span className="text-[8px] font-mono bg-blue-500/10 text-blue-400/80 px-1 rounded">
                        {CONTEXT_LABELS[task.link_context].label}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold font-mono text-foreground mb-1 truncate">
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="text-[11px] font-mono text-foreground/70 line-clamp-2 mb-2">
                      {task.description}
                    </p>
                  )}
                  {task.project_name && (
                    <div className="text-[10px] font-mono text-muted-foreground/50">
                      <span className="text-primary/60 mr-1">{task.project_name}</span>
                      {task.ticket_ref && ` - Ticket ${task.ticket_ref}`}
                    </div>
                  )}
                  {task.assigned_to && (
                    <div className="text-[10px] font-mono text-muted-foreground/40 mt-1">
                      Assigned: {task.assigned_to}
                    </div>
                  )}
                </div>
              ))}

              {activeTab === 'memory' && searchResults?.memory.results.map((mem, i) => (
                <div key={i} className="bg-[hsl(var(--surface-1))] border border-border/50 rounded-lg p-3 mb-2 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold font-mono text-foreground flex-1 truncate">
                      {mem.title}
                    </h3>
                    {mem.link_context && (
                      <span className="text-[8px] font-mono bg-blue-500/10 text-blue-400/80 px-1 rounded">
                        {CONTEXT_LABELS[mem.link_context].label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground/60 mb-2">
                    {mem.path}
                  </div>
                  <div className="text-[11px] font-mono text-foreground/70 line-clamp-3">
                    {mem.snippet}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground/40 mt-2 flex justify-between">
                    <span>Rank: {Math.round(mem.rank)}</span>
                    {mem.task_id && <span>Task #{mem.task_id}</span>}
                  </div>
                </div>
              ))}

              {hasSearched && (
                <div className="mt-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoading}
                    className="px-4 py-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-2))] rounded transition-colors disabled:opacity-50"
                  >
                    {t('loadMore', { count: limit })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}