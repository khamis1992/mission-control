'use client'

import React from 'react'

export type WorkflowNodeType = 'agent' | 'tool' | 'condition' | 'human' | 'checkpoint'

const NodePalette: React.FC<{ onSelect: (type: WorkflowNodeType) => void }> = ({ onSelect }) => {
  const nodeTypes = [
    { id: 'agent', name: 'Agent', icon: '🤖', tooltip: 'AI Agent' },
    { id: 'tool', name: 'Tool', icon: '🔧', tooltip: 'Tool/Function' },
    { id: 'condition', name: 'Condition', icon: '❓', tooltip: 'Branching Logic' },
    { id: 'human', name: 'Human', icon: '👤', tooltip: 'Human Approval' },
    { id: 'checkpoint', name: 'Checkpoint', icon: '💾', tooltip: 'Checkpoint State' }
  ]

  return (
    <div className="w-64 bg-gray-900 p-4 rounded-l-lg border-r border-gray-800 h-full overflow-y-auto">
      <h3 className="font-bold mb-4 text-gray-300">Nodes</h3>
      <div className="space-y-2">
        {nodeTypes.map(node => (
          <div
            key={node.id}
            onClick={() => onSelect(node.id as any)}
            className="flex items-center gap-3 p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-pointer transition-colors"
          >
            <span className="text-2xl">{node.icon}</span>
            <div className="flex-1">
              <div className="font-medium text-gray-200">{node.name}</div>
              <div className="text-xs text-gray-500">{node.tooltip}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-800">
        <h3 className="font-bold mb-2 text-gray-300">Workflows</h3>
        <div className="text-sm text-gray-500 italic">
          Load a workflow to view and edit its nodes
        </div>
      </div>
    </div>
  )
}

export default NodePalette
