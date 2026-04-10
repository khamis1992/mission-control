'use client'

import { useState } from 'react'

interface DeploymentTabProps {
  task: any
  deployment: any
  buildRuns: any[]
}

export function DeploymentTab({ task, deployment, buildRuns }: DeploymentTabProps) {
  const [expandedLogs, setExpandedLogs] = useState<number | null>(null)
  
  const statusColors: Record<string, string> = {
    ready: 'bg-green-500',
    building: 'bg-yellow-500',
    queued: 'bg-blue-500',
    error: 'bg-red-500'
  }
  
  if (!deployment && buildRuns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <span className="text-4xl mb-2">🚀</span>
        <span>No deployment yet</span>
        <button className="mt-4 px-4 py-2 bg-primary text-white rounded">
          Deploy
        </button>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {deployment && (
        <div className="p-4 bg-surface-1 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusColors[deployment.status] || 'bg-gray-500'}`} />
              <span className="text-sm capitalize">{deployment.status}</span>
              <span className="text-xs text-muted-foreground">({deployment.provider})</span>
            </div>
            {deployment.live_url && (
              <a 
                href={deployment.live_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-3 py-1 text-sm bg-primary text-white rounded hover:opacity-90"
              >
                Open App →
              </a>
            )}
          </div>
          
          {deployment.status === 'building' && (
            <div className="mt-3">
              <div className="h-1 bg-surface-2 rounded overflow-hidden">
                <div className="h-full bg-primary animate-pulse" style={{ width: '50%' }} />
              </div>
            </div>
          )}
        </div>
      )}
      
      <div>
        <h4 className="text-sm font-medium mb-2">Build History</h4>
        {buildRuns.length > 0 ? (
          <div className="space-y-2">
            {buildRuns.map((run, i) => (
              <div key={run.id || i} className="p-2 bg-surface-1 rounded">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedLogs(expandedLogs === i ? null : i)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      run.status === 'success' ? 'bg-green-500' :
                      run.status === 'failed' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`} />
                    <span className="text-sm">{run.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
                  </div>
                </div>
                
                {expandedLogs === i && run.output && (
                  <pre className="mt-2 p-2 bg-surface-2 rounded text-xs overflow-auto max-h-48">
                    {run.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No build history</div>
        )}
      </div>
      
      <div className="flex gap-2">
        <button className="px-3 py-1.5 text-sm bg-surface-1 border border-border rounded hover:bg-surface-2">
          Retry Deployment
        </button>
        <button className="px-3 py-1.5 text-sm bg-surface-1 border border-border rounded hover:bg-surface-2">
          View Logs
        </button>
      </div>
    </div>
  )
}