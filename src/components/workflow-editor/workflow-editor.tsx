'use client'

import React, { useState } from 'react'
import { randomUUID } from 'crypto'
import NodePalette from './node-palette'
import PropertiesPanel from './properties-panel'


export type WorkflowPattern = 
  | 'sequential'
  | 'hierarchical'
  | 'round-robin'
  | 'parallel'
  | 'swarm'
  | 'group-chat'

export interface WorkflowNode {
  id: string
  type: 'agent' | 'tool' | 'condition' | 'human' | 'checkpoint'
  agentId?: string
  toolId?: string
  condition?: string
  next?: string | string[]
  config: Record<string, any>
}

export interface WorkflowEdge {
  from: string
  to: string
  condition?: string
  is_default?: boolean
}

export interface Workflow {
  id: string
  name: string
  pattern: WorkflowPattern
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  triggers: { type: 'manual' | 'api' | 'cron' | 'event'; config: Record<string, any> }[]
  created_at: number
  enabled: boolean
}

const WorkflowEditor: React.FC = () => {
  const [workflow, setWorkflow] = useState<Workflow>({
    id: '',
    name: '',
    pattern: 'sequential',
    nodes: [],
    edges: [],
    triggers: [],
    created_at: Math.floor(Date.now() / 1000),
    enabled: true
  })

  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [edges, setEdges] = useState<WorkflowEdge[]>([])

  const handleSelectNode = (type: WorkflowNode['type']) => {
    const newNode: WorkflowNode = {
      id: `${type}-${nodes.length + 1}`,
      type,
      config: {}
    }
    setNodes([...nodes, newNode])
    setSelectedNode(newNode)
  }

  const handleSave = async () => {
    const workflowData = {
      id: workflow.id || randomUUID(),
      name: workflow.name,
      pattern: workflow.pattern,
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      triggers: JSON.stringify(workflow.triggers),
      enabled: workflow.enabled ? 1 : 0,
      created_at: workflow.created_at
    }

    try {
      const res = await fetch('/api/workflows', {
        method: workflow.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowData)
      })

      const data = await res.json()
      if (data.workflow?.id) {
        setWorkflow({ ...workflow, id: data.workflow.id })
      }
    } catch (error) {
      console.error('Failed to save workflow:', error)
    }
  }

  const handleExecute = async () => {
    if (!workflow.id) return

    try {
      const res = await fetch(`/api/workflows/${workflow.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} })
      })

      const result = await res.json()
      console.log('Workflow executed:', result)
    } catch (error) {
      console.error('Failed to execute workflow:', error)
    }
  }

  return (
    <div className="flex h-full bg-gray-900">
      {/* Sidebar */}
      <div className="flex-shrink-0">
        <NodePalette onSelect={handleSelectNode} />
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Workflow Name"
              value={workflow.name}
              onChange={e => setWorkflow({ ...workflow, name: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
            />
            <select
              value={workflow.pattern}
              onChange={e => setWorkflow({ ...workflow, pattern: e.target.value as WorkflowPattern })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
            >
              <option value="sequential">Sequential</option>
              <option value="hierarchical">Hierarchical</option>
              <option value="parallel">Parallel</option>
              <option value="round-robin">Round Robin</option>
              <option value="swarm">Swarm</option>
              <option value="group-chat">Group Chat</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
            >
              Save
            </button>
            <button
              onClick={handleExecute}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm"
            >
              Execute
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-gray-800/50 relative overflow-hidden">
          {/* Placeholder for React Flow canvas */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="mb-4 text-4xl">🖱️</div>
              <p>Drag and drop nodes to build your workflow</p>
              <p className="text-sm mt-2">
                {nodes.length} nodes | {edges.length} edges
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Properties Panel */}
      {selectedNode && (
        <PropertiesPanel
          node={selectedNode}
          onChange={(updates: Partial<WorkflowNode>) => {
            setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, ...updates } : n))
            setSelectedNode({ ...selectedNode, ...updates })
          }}
        />
      )}
    </div>
  )
}

export default WorkflowEditor
