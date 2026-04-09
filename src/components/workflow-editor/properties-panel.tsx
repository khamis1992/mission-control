'use client'

import React, { useState } from 'react'

export interface WorkflowNode {
  id: string
  type: 'agent' | 'tool' | 'condition' | 'human' | 'checkpoint'
  agentId?: string
  toolId?: string
  condition?: string
  config: Record<string, any>
}

const PropertiesPanel: React.FC<{ node: WorkflowNode; onChange: (updates: Partial<WorkflowNode>) => void }> = ({ node, onChange }) => {
  const [selectedTool, setSelectedTool] = useState(node.toolId || '')
  const [toolConfig, setToolConfig] = useState(node.config || {})

  const handleToolSelect = (value: string) => {
    setSelectedTool(value)
    onChange({ toolId: value, config: { ...toolConfig, tool: value } })
  }

  const handleConfigChange = (key: string, value: any) => {
    setToolConfig({ ...toolConfig, [key]: value })
    onChange({ config: { ...toolConfig, [key]: value } })
  }

  return (
    <div className="w-64 bg-gray-900 p-4 rounded-r-lg border-l border-gray-800 h-full overflow-y-auto">
      <h3 className="font-bold mb-4 text-gray-300">Properties</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Node Type</label>
          <div className="text-gray-200 font-mono">{node.type}</div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1">Node Name</label>
          <input
            type="text"
            value={node.id}
            onChange={e => onChange({ id: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
          />
        </div>

        {node.type === 'agent' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Agent</label>
            <select
              value={node.agentId || ''}
              onChange={e => onChange({ agentId: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
            >
              <option value="">Select an agent</option>
              <option value="planner">Planner Agent</option>
              <option value="architect">Architect Agent</option>
              <option value="backend">Backend Agent</option>
              <option value="frontend">Frontend Agent</option>
              <option value="qa">QA Agent</option>
              <option value="devops">DevOps Agent</option>
              <option value="reviewer">Code Reviewer</option>
              <option value="recovery">Recovery Agent</option>
            </select>
          </div>
        )}

        {node.type === 'tool' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Tool</label>
            <select
              value={selectedTool}
              onChange={e => handleToolSelect(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
            >
              <option value="">Select a tool</option>
              <option value="query-database">Query Database</option>
              <option value="fetch-api">Fetch API</option>
              <option value="generate-code">Generate Code</option>
              <option value="run-tests">Run Tests</option>
              <option value="deploy-service">Deploy Service</option>
            </select>

            {selectedTool === 'query-database' && (
              <div className="mt-3">
                <label className="block text-sm text-gray-500 mb-1">Query</label>
                <textarea
                  value={toolConfig.query || ''}
                  onChange={e => handleConfigChange('query', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded h-20 font-mono text-sm"
                  placeholder="SELECT * FROM tasks"
                />
              </div>
            )}
          </div>
        )}

        {node.type === 'condition' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Condition</label>
            <input
              type="text"
              value={node.condition || ''}
              onChange={e => onChange({ condition: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
              placeholder="inputs.status === 'completed'"
            />
            <div className="text-xs text-gray-500 mt-1">
              JavaScript expression - returns true/false
            </div>
          </div>
        )}

        {node.type === 'human' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Approval Timeout (seconds)</label>
            <input
              type="number"
              value={node.config.timeout || 3600}
              onChange={e => onChange({ config: { ...node.config, timeout: parseInt(e.target.value) } })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
            />
          </div>
        )}

        {node.type === 'checkpoint' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Checkpoint Progress</label>
            <input
              type="number"
              value={node.config.progress || 0}
              onChange={e => onChange({ config: { ...node.config, progress: parseInt(e.target.value) } })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default PropertiesPanel
