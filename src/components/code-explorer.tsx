'use client'

import { useState, useEffect, useCallback } from 'react'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  language?: string
  children?: FileNode[]
  expanded?: boolean
}

interface CodeExplorerProps {
  workspaceId: number
  projectRoot?: string
  onFileSelect?: (path: string, content?: string) => void
  selectedFile?: string
}

export function CodeExplorer({ workspaceId, projectRoot, onFileSelect, selectedFile }: CodeExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | undefined>(selectedFile)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadFileTree()
  }, [workspaceId, projectRoot])

  const loadFileTree = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/files`)
      if (!res.ok) throw new Error('Failed to load files')
      const data = await res.json()
      setFiles(data.files || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }

  const toggleDirectory = (path: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedDirs(newExpanded)
  }

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'directory') {
      toggleDirectory(node.path)
    } else {
      setSelectedPath(node.path)
      
      if (onFileSelect) {
        try {
          const res = await fetch(`/api/files/${encodeURIComponent(node.path)}/content`)
          const content = await res.text()
          onFileSelect(node.path, content)
        } catch {
          onFileSelect(node.path)
        }
      }
    }
  }

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = selectedPath === node.path
    const indent = depth * 16

    return (
      <div key={node.path}>
        <button
          onClick={() => handleFileClick(node)}
          className={`w-full text-left flex items-center gap-1 px-2 py-1 hover:bg-surface-1 rounded ${
            isSelected ? 'bg-primary/20 text-primary' : 'text-foreground'
          }`}
          style={{ paddingLeft: `${indent + 8}px` }}
        >
          {node.type === 'directory' ? (
            <>
              <span className="text-muted-foreground">
                {isExpanded ? '📂' : '📁'}
              </span>
              <span className="text-sm">{node.name}</span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                {getFileIcon(node.name)}
              </span>
              <span className="text-sm">{node.name}</span>
            </>
          )}
        </button>
        
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-400">
        {error}
        <button
          onClick={loadFileTree}
          className="ml-2 text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-2">
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="text-xs text-muted-foreground font-medium uppercase">Files</span>
        <button
          onClick={loadFileTree}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ↻
        </button>
      </div>
      <div>
        {files.map(node => renderNode(node))}
      </div>
    </div>
  )
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '🔷'
    case 'js':
    case 'jsx':
    case 'mjs':
      return '🟨'
    case 'json':
      return '📋'
    case 'md':
      return '📝'
    case 'css':
    case 'scss':
    case 'sass':
      return '🎨'
    case 'html':
      return '🌐'
    case 'py':
      return '🐍'
    case 'go':
      return '🔵'
    case 'rs':
      return '🦀'
    case 'java':
      return '☕'
    case 'sh':
    case 'bash':
      return '🖥️'
    default:
      return '📄'
  }
}

interface FileViewerProps {
  path: string
  content: string
  language?: string
  readOnly?: boolean
  onSave?: (content: string) => void
}

export function FileViewer({ path, content, language, readOnly = true, onSave }: FileViewerProps) {
  const [editContent, setEditContent] = useState(content)
  const [isEditing, setIsEditing] = useState(!readOnly)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditContent(content)
    setIsEditing(!readOnly)
  }, [content, readOnly])

  const handleSave = async () => {
    if (!onSave) return
    
    setSaving(true)
    try {
      await onSave(editContent)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const filename = path.split('/').pop() || path

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{filename}</span>
          <span className="text-xs text-muted-foreground">{language || 'text'}</span>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && onSave && (
            <>
              <button
                onClick={() => setEditContent(content)}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2 py-1 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          {!readOnly && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 bg-surface-0 text-foreground font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <pre className="p-4 text-sm font-mono text-foreground overflow-auto">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}

interface CodeExplorerPanelProps {
  workspaceId: number
  onFileSelect?: (path: string, content: string) => void
}

export function CodeExplorerPanel({ workspaceId, onFileSelect }: CodeExplorerPanelProps) {
  const [activeView, setActiveView] = useState<'explorer' | 'search'>('explorer')
  const [selectedFile, setSelectedFile] = useState<string | undefined>()
  const [fileContent, setFileContent] = useState<string | undefined>()

  const handleFileSelect = useCallback((path: string, content?: string) => {
    setSelectedFile(path)
    if (content) {
      setFileContent(content)
    }
    if (onFileSelect) {
      onFileSelect(path, content || '')
    }
  }, [onFileSelect])

  return (
    <div className="flex h-full border border-border rounded-lg overflow-hidden">
      <div className="w-64 border-r border-border bg-surface-0">
        <CodeExplorer
          workspaceId={workspaceId}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
        />
      </div>
      <div className="flex-1 flex flex-col bg-surface-1">
        {selectedFile && fileContent !== undefined ? (
          <FileViewer
            path={selectedFile}
            content={fileContent}
            onSave={(content) => {
              console.log('Save:', selectedFile, content.length, 'chars')
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a file to view its contents
          </div>
        )}
      </div>
    </div>
  )
}