'use client'

import { useState, useEffect, useRef } from 'react'

interface BuildLogsTabProps {
  task: any
  buildRuns: any[]
}

interface LogEntry {
  taskId: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'warning'
  text: string
  timestamp: number
  source: 'build' | 'terminal' | 'agent' | 'test' | 'deploy'
}

export function BuildLogsTab({ task, buildRuns }: BuildLogsTabProps) {
  const [selectedRun, setSelectedRun] = useState<any | null>(buildRuns[0] || null)
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!task?.id) return

    const connectStreaming = () => {
      const url = `/api/tasks/${task.id}/logs/stream`
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        setIsStreaming(true)
        setStreamError(null)
      }
      
      eventSource.addEventListener('log', (event: MessageEvent) => {
        try {
          const log: LogEntry = JSON.parse(event.data)
          setLiveLogs(prev => {
            const newLogs = [...prev, log]
            if (newLogs.length > 500) {
              return newLogs.slice(-500)
            }
            return newLogs
          })
        } catch (e) {
          console.error('Failed to parse log event:', e)
        }
      })
      
      eventSource.addEventListener('status', (event: MessageEvent) => {
        try {
          const status = JSON.parse(event.data)
          if (status.phase === 'completed' || status.phase === 'failed') {
            eventSource.close()
            setIsStreaming(false)
          }
        } catch (e) {
          console.error('Failed to parse status event:', e)
        }
      })
      
      eventSource.onerror = () => {
        setStreamError('Connection lost. Retrying...')
        setIsStreaming(false)
        eventSource.close()
        setTimeout(() => {
          if (eventSource.readyState === EventSource.CLOSED) {
            connectStreaming()
          }
        }, 5000)
      }
    }
    
    connectStreaming()
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setIsStreaming(false)
    }
  }, [task?.id])
  
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [liveLogs])
  
  const filteredRuns = filter === 'all' 
    ? buildRuns 
    : buildRuns.filter((r: any) => r.status === filter)
  
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }
  
  const formatLogTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }
  
  const getLogColor = (type: string) => {
    switch (type) {
      case 'stdout': return 'text-green-400'
      case 'stderr': return 'text-red-400'
      case 'error': return 'text-red-500'
      case 'warning': return 'text-yellow-400'
      case 'info': return 'text-blue-400'
      default: return 'text-foreground'
    }
  }
  
  const clearLogs = () => {
    setLiveLogs([])
  }
  
  return (
    <div className="flex h-full">
      <div className="w-52 border-r border-border overflow-auto">
        <div className="p-2 border-b border-border">
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="w-full px-2 py-1 text-sm bg-surface-1 border border-border rounded"
          >
            <option value="all">All Builds</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        
        <div className="py-1">
          {filteredRuns.map((run: any, i: number) => (
            <button
              key={run.id || i}
              onClick={() => setSelectedRun(run)}
              className={`w-full text-left px-3 py-2 hover:bg-surface-1 ${
                selectedRun?.id === run.id ? 'bg-surface-1' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  run.status === 'success' ? 'bg-green-500' :
                  run.status === 'failed' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
                <span className="text-xs font-medium capitalize">{run.status}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatDate(run.created_at)}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${isStreaming ? 'text-green-400' : 'text-muted-foreground'}`}>
              {isStreaming ? '● Live' : 'Offline'}
            </span>
            {streamError && (
              <span className="text-xs text-red-400">{streamError}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {liveLogs.length} lines
            </span>
            <button
              onClick={clearLogs}
              className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground bg-surface-1 rounded"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          {selectedRun ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    selectedRun.status === 'success' ? 'bg-green-500' :
                    selectedRun.status === 'failed' ? 'bg-red-500' :
                    'bg-yellow-500'
                  }`} />
                  <span className="text-sm font-medium capitalize">{selectedRun.status}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Duration: {selectedRun.duration_ms ? `${(selectedRun.duration_ms / 1000).toFixed(1)}s` : 'N/A'}
                </div>
              </div>
              
              {selectedRun.commit_sha && (
                <div className="text-xs text-muted-foreground mb-2">
                  Commit: {selectedRun.commit_sha.slice(0, 7)}
                </div>
              )}
              
              {selectedRun.errors && Array.isArray(selectedRun.errors) && selectedRun.errors.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium mb-1">Errors</h4>
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
                    {selectedRun.errors.map((e: any, i: number) => (
                      <div key={i}>{e.message}</div>
                    ))}
                  </div>
                </div>
              )}
              
              {liveLogs.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Live Output
                  </h4>
                  <div className="bg-surface-1 rounded-lg p-2 max-h-64 overflow-auto font-mono text-xs">
                    {liveLogs.map((log, i) => (
                      <div key={i} className={`${getLogColor(log.type)}`}>
                        <span className="text-muted-foreground">[{formatLogTime(log.timestamp)}]</span>{' '}
                        <span className="text-muted-foreground">[{log.source}]</span>{' '}
                        {log.text}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}
              
              {selectedRun.output ? (
                <div>
                  <h4 className="text-xs font-medium mb-2">Build Output</h4>
                  <pre className="p-3 bg-surface-1 rounded-lg text-xs overflow-auto font-mono max-h-96">
                    {selectedRun.output}
                  </pre>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">No output available</div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a build run to view logs
            </div>
          )}
        </div>
      </div>
    </div>
  )
}