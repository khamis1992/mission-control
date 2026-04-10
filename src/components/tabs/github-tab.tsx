'use client'

import { useState, useEffect } from 'react'

interface GitHubTabProps {
  task: any
  connection: any
  commits: any[]
  prs: any[]
}

export function GitHubTab({ task, connection, commits, prs }: GitHubTabProps) {
  const [loading, setLoading] = useState(false)
  
  if (!connection && !task.github_repo) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <span className="text-4xl mb-2">🐙</span>
        <span>No GitHub repository connected</span>
        <button className="mt-4 px-4 py-2 bg-primary text-white rounded">
          Connect Repository
        </button>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${connection?.is_connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <a 
          href={connection?.repo_url || task.github_repo} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {connection?.repo_name || task.github_repo?.split('/').pop()}
        </a>
        <span className="text-xs text-muted-foreground">
          {connection?.default_branch || task.github_branch || 'main'}
        </span>
      </div>
      
      <div>
        <h4 className="text-sm font-medium mb-2">Recent Commits</h4>
        {commits.length > 0 ? (
          <div className="space-y-2">
            {commits.slice(0, 5).map((commit, i) => (
              <div key={i} className="text-sm bg-surface-1 p-2 rounded">
                <div className="font-medium truncate">{commit.message?.split('\n')[0]}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {commit.sha?.slice(0, 7)} · {commit.author}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No commits yet</div>
        )}
      </div>
      
      {prs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Pull Requests</h4>
          <div className="space-y-2">
            {prs.slice(0, 3).map((pr, i) => (
              <div key={i} className="text-sm bg-surface-1 p-2 rounded">
                <a href={pr.url} target="_blank" className="hover:text-primary">
                  #{pr.number} {pr.title}
                </a>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  pr.state === 'open' ? 'bg-green-500/20 text-green-400' :
                  pr.state === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {pr.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex gap-2">
        <button className="px-3 py-1.5 text-sm bg-surface-1 border border-border rounded hover:bg-surface-2">
          Sync
        </button>
        <button className="px-3 py-1.5 text-sm bg-surface-1 border border-border rounded hover:bg-surface-2">
          Create Branch
        </button>
        <button className="px-3 py-1.5 text-sm bg-surface-1 border border-border rounded hover:bg-surface-2">
          Create PR
        </button>
      </div>
    </div>
  )
}