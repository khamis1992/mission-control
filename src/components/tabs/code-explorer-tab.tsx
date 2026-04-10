'use client'

import { useState } from 'react'

interface CodeExplorerTabProps {
  task: any
  files: any[]
}

export function CodeExplorerTab({ task, files }: CodeExplorerTabProps) {
  const [selectedFile, setSelectedFile] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  const filteredFiles = searchQuery 
    ? files.filter(f => f.path.toLowerCase().includes(searchQuery.toLowerCase()))
    : files
  
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No generated files yet. Run the task to generate code.
      </div>
    )
  }
  
  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-border overflow-auto">
        <div className="p-2">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2 py-1 text-sm bg-surface-1 border border-border rounded"
          />
        </div>
        <div className="py-1">
          {filteredFiles.map((file) => (
            <button
              key={file.id || file.path}
              onClick={() => setSelectedFile(file)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-1 ${
                selectedFile?.path === file.path ? 'bg-surface-1 text-primary' : 'text-foreground'
              }`}
            >
              <span className="truncate">{file.path}</span>
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {selectedFile ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{selectedFile.path}</span>
              <span className="text-xs text-muted-foreground">
                v{selectedFile.version} · {selectedFile.language}
              </span>
            </div>
            <pre className="p-4 bg-surface-1 rounded-lg overflow-auto text-sm">
              <code>{selectedFile.content || 'No content available'}</code>
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a file to view its content
          </div>
        )}
      </div>
    </div>
  )
}