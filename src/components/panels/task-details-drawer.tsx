'use client'

import { useState, useEffect } from 'react'

interface Task {
  id: number
  title: string
  description?: string
  status: string
  priority: string
  assigned_to?: string
  created_by: string
  created_at: number
  updated_at: number
  task_type?: 'normal' | 'mission' | 'subtask' | 'system'
  parent_task_id?: number
  execution_mode?: 'manual' | 'autonomous'
  agent_role?: string
  parallel_group_id?: string
  retry_count?: number
  max_retries?: number
  failure_type?: string
  recovery_strategy?: any
  checkpoint_data?: any
  artifacts?: any[]
  decisions?: any[]
  recovery_logs?: any[]
  metadata?: any
}

interface Subtask extends Task {}

interface Agent {
  name: string
  role: string
  status: string
}

const TABS = [
  { id: 'overview', icon: '📋', label: 'Overview' },
  { id: 'intelligence', icon: '🧠', label: 'Intelligence' },
  { id: 'subtasks', icon: '🌳', label: 'Subtasks' },
  { id: 'agents', icon: '🤖', label: 'Agents' },
  { id: 'session', icon: '⚡', label: 'Session' },
  { id: 'discussion', icon: '💬', label: 'Discussion' },
  { id: 'quality', icon: '✅', label: 'Quality' },
  { id: 'artifacts', icon: '📦', label: 'Artifacts' },
  { id: 'logs', icon: '📜', label: 'Logs' },
  { id: 'recovery', icon: '🔧', label: 'Recovery' },
]

interface TaskDetailsDrawerProps {
  task: Task
  onClose: () => void
  agents: Agent[]
}

export function TaskDetailsDrawer({ task, onClose, agents }: TaskDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loadingSubtasks, setLoadingSubtasks] = useState(false)
  const [newDecision, setNewDecision] = useState('')
  const [newDecisionType, setNewDecisionType] = useState('proposal')
  const [decisionFilter, setDecisionFilter] = useState('all')
  const [executing, setExecuting] = useState(false)
  const [executionProgress, setExecutionProgress] = useState<{total: number; completed: number; failed: number} | null>(null)

  const fetchSubtasks = () => {
    fetch(`/api/tasks?parent_task_id=${task.id}`)
      .then(res => res.json())
      .then(data => setSubtasks(data.tasks || []))
      .catch(() => {})
  }

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (executing) {
      interval = setInterval(() => {
        fetch(`/api/tasks?parent_task_id=${task.id}`)
          .then(res => res.json())
          .then(data => {
            const tasks = data.tasks || []
            setSubtasks(tasks)
            const inProgress = tasks.filter((t: Subtask) => t.status === 'in_progress').length
            if (inProgress === 0 && tasks.length > 0) {
              setExecuting(false)
              setExecutionProgress(null)
            }
          })
          .catch(() => {})
      }, 2000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [executing, task.id])

  useEffect(() => {
    if (activeTab === 'subtasks' || activeTab === 'quality') {
      const eventSource = new EventSource('/api/events')
      const handler = (event: any) => {
        const data = JSON.parse(event.data)
        if (data.data?.task_id === task.id) {
          fetchSubtasks()
        }
      }
      eventSource.addEventListener('server-event', handler as any)
      return () => {
        eventSource.close()
        eventSource.removeEventListener('server-event', handler as any)
      }
    }
  }, [activeTab, task.id])

  useEffect(() => {
    if (activeTab === 'subtasks') {
      setLoadingSubtasks(true)
      fetchSubtasks()
      setLoadingSubtasks(false)
    }
  }, [activeTab, task.id])

  const decisions = task.decisions ? (typeof task.decisions === 'string' ? JSON.parse(task.decisions) : task.decisions) : []
  const artifacts = task.artifacts ? (typeof task.artifacts === 'string' ? JSON.parse(task.artifacts) : task.artifacts) : []
  const recoveryLogs = task.recovery_logs ? (typeof task.recovery_logs === 'string' ? JSON.parse(task.recovery_logs) : task.recovery_logs) : []

  const handleAddDecision = async () => {
    if (!newDecision.trim()) return
    const decision = {
      id: Date.now(),
      content: newDecision,
      type: newDecisionType,
      created_at: Date.now(),
      created_by: 'user',
    }
    const updatedDecisions = [...decisions, decision]
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: JSON.stringify(updatedDecisions) }),
      })
      setNewDecision('')
    } catch (err) {
      console.error('Failed to save decision:', err)
    }
  }

  const assignedAgent = agents.find(a => a.name === task.assigned_to)
  const agentStatus = assignedAgent?.status || 'offline'

  const statusColor = (status: string) => {
    switch (status) {
      case 'idle': return 'bg-green-500'
      case 'busy': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-[90vw] bg-surface-0 border-l border-border z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-2 h-2 rounded-full ${task.status === 'done' ? 'bg-green-500' : task.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'}`} />
            <h2 className="text-lg font-semibold text-foreground truncate">{task.title}</h2>
            {task.task_type === 'mission' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">🎯 Mission</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-surface-1"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? 'border-primary text-foreground bg-surface-1' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {task.description && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs text-muted-foreground mb-1">Status</h4>
                  <span className="text-sm px-2 py-1 rounded bg-surface-1 border border-border">{task.status}</span>
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground mb-1">Priority</h4>
                  <span className={`text-sm px-2 py-1 rounded border ${
                    task.priority === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    task.priority === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                    'bg-green-500/20 text-green-400 border-green-500/30'
                  }`}>{task.priority}</span>
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground mb-1">Task Type</h4>
                  <span className="text-sm text-foreground">{task.task_type || 'normal'}</span>
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground mb-1">Execution Mode</h4>
                  <span className="text-sm text-foreground">{task.execution_mode || 'manual'}</span>
                </div>
                {task.agent_role && (
                  <div>
                    <h4 className="text-xs text-muted-foreground mb-1">Agent Role</h4>
                    <span className="text-sm text-foreground">{task.agent_role}</span>
                  </div>
                )}
                {task.parallel_group_id && (
                  <div>
                    <h4 className="text-xs text-muted-foreground mb-1">Parallel Group</h4>
                    <span className="text-sm text-foreground font-mono">{task.parallel_group_id}</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                Created: {new Date(task.created_at).toLocaleString()} • Updated: {new Date(task.updated_at).toLocaleString()}
              </div>
            </div>
          )}

          {activeTab === 'intelligence' && (
            <div className="space-y-4">
              {(() => {
                const metadata = task.metadata ? (typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata) : {}
                const analysis = metadata.goal_analysis
                if (!analysis) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No goal analysis available</p>
                      <button
                        onClick={async () => {
                          setExecuting(true)
                          try {
                            const res = await fetch(`/api/tasks/${task.id}/analyze`, { method: 'POST' })
                            if (!res.ok) throw new Error('Failed to analyze')
                            const data = await res.json()
                            if (data.goal_analysis) {
                              const newMeta = { ...metadata, goal_analysis: data }
                              setExecuting(false)
                            }
                          } catch (err) {
                            console.error('Failed to analyze:', err)
                            alert('Failed to analyze task')
                          } finally {
                            setExecuting(false)
                          }
                        }}
                        disabled={executing}
                        className="mt-2 px-3 py-1.5 text-sm bg-primary/20 hover:bg-primary/30 text-primary rounded border border-primary/30"
                      >
                        {executing ? '⏳ Analyzing...' : '🧠 Analyze Goal'}
                      </button>
                    </div>
                  )
                }
                const ga = analysis.goal_analysis
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">{ga.domain}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        ga.complexity === 'low' ? 'bg-green-500/20 text-green-400' :
                        ga.complexity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>{ga.complexity}</span>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Entities</h4>
                      <div className="flex flex-wrap gap-1">{ga.entities.map((e: string) => (
                        <span key={e} className="text-xs px-2 py-0.5 bg-surface-1 rounded">{e}</span>
                      ))}</div>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Modules</h4>
                      <div className="flex flex-wrap gap-1">{ga.modules.map((m: string) => (
                        <span key={m} className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">{m}</span>
                      ))}</div>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Workflows</h4>
                      <ul className="text-sm space-y-1">{ga.workflows.map((w: string) => (
                        <li key={w}>• {w}</li>
                      ))}</ul>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Integrations</h4>
                      <div className="flex flex-wrap gap-1">{ga.integrations.map((i: string) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">{i}</span>
                      ))}</div>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Risks</h4>
                      <ul className="text-sm space-y-1">{ga.risks.map((r: string) => (
                        <li key={r} className="text-orange-400">⚠ {r}</li>
                      ))}</ul>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Architecture</h4>
                      <p className="text-sm">{ga.suggestedArchitecture}</p>
                    </div>
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-1">Strategy</h4>
                      <p className="text-sm">{ga.executionStrategy}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'subtasks' && (
            <div>
              {task.task_type === 'mission' && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={async () => {
                      setExecuting(true)
                      try {
                        const res = await fetch(`/api/tasks/${task.id}/generate-subtasks`, { method: 'POST' })
                        if (!res.ok) throw new Error('Failed to generate subtasks')
                        const data = await fetch(`/api/tasks?parent_task_id=${task.id}`).then(r => r.json())
                        setSubtasks(data.tasks || [])
                      } catch (err) {
                        console.error('Failed to generate subtasks:', err)
                        alert('Failed to generate subtasks')
                      } finally {
                        setExecuting(false)
                      }
                    }}
                    disabled={executing}
                    className="px-3 py-1.5 text-sm bg-primary/20 hover:bg-primary/30 text-primary rounded border border-primary/30 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {executing ? '⏳' : '🌱'} Generate Subtasks
                  </button>
                  <button
                    onClick={async () => {
                      setExecuting(true)
                      try {
                        const res = await fetch(`/api/tasks/${task.id}/execute`, { method: 'POST' })
                        if (!res.ok) throw new Error('Failed to execute mission')
                        alert('Mission execution started')
                      } catch (err) {
                        console.error('Failed to execute mission:', err)
                        alert('Failed to execute mission')
                      } finally {
                        setExecuting(false)
                      }
                    }}
                    disabled={executing}
                    className="px-3 py-1.5 text-sm bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded border border-green-500/30 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {executing ? '⏳' : '🚀'} Execute Mission
                  </button>
                </div>
              )}
              {loadingSubtasks ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : subtasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No subtasks found</p>
                  {task.execution_mode === 'autonomous' && task.task_type === 'mission' && (
                    <p className="text-xs mt-2">This mission will auto-generate subtasks when executed</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {subtasks.map(subtask => (
                    <div key={subtask.id} className="p-3 bg-surface-1 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          subtask.status === 'done' ? 'bg-green-500' :
                          subtask.status === 'in_progress' ? 'bg-blue-500' :
                          subtask.status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                        }`} />
                        <span className="text-sm font-medium text-foreground">{subtask.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{subtask.status}</span>
                        {subtask.agent_role && <span>• {subtask.agent_role}</span>}
                        {subtask.assigned_to && <span>• @{subtask.assigned_to}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-surface-1 rounded-lg border border-border">
                <div className={`w-3 h-3 rounded-full ${statusColor(agentStatus)}`} />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-foreground">{task.assigned_to || 'Unassigned'}</h4>
                  <p className="text-xs text-muted-foreground">{agentStatus}</p>
                </div>
                {task.execution_mode === 'autonomous' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">Auto</span>
                )}
              </div>
              
              {task.agent_role && (
                <div>
                  <h4 className="text-xs text-muted-foreground mb-1">Agent Role</h4>
                  <span className="text-sm px-2 py-1 rounded bg-surface-1 border border-border">{task.agent_role}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'session' && (
            <div className="space-y-4">
              {(() => {
                const checkpoint = task.checkpoint_data ? (typeof task.checkpoint_data === 'string' ? JSON.parse(task.checkpoint_data) : task.checkpoint_data) : null
                
                if (!checkpoint) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No active session</p>
                      <p className="text-xs mt-2">Start executing this task to see session state</p>
                    </div>
                  )
                }
                
                const phaseEmoji: Record<string, string> = {
                  'initializing': '🔄',
                  'planning': '📋',
                  'executing': '⚡',
                  'observing': '👁',
                  'reflecting': '💭',
                  'adapting': '🔧',
                  'completed': '✅',
                  'failed': '❌'
                }
                
                const phaseColor: Record<string, string> = {
                  'initializing': 'bg-blue-500/20 text-blue-400',
                  'planning': 'bg-purple-500/20 text-purple-400',
                  'executing': 'bg-yellow-500/20 text-yellow-400',
                  'observing': 'bg-cyan-500/20 text-cyan-400',
                  'reflecting': 'bg-orange-500/20 text-orange-400',
                  'adapting': 'bg-pink-500/20 text-pink-400',
                  'completed': 'bg-green-500/20 text-green-400',
                  'failed': 'bg-red-500/20 text-red-400'
                }
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm px-3 py-1.5 rounded-full ${phaseColor[checkpoint.phase] || 'bg-gray-500/20 text-gray-400'}`}>
                        {phaseEmoji[checkpoint.phase] || '❓'} {checkpoint.phase || 'unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Attempt {checkpoint.attemptCount ?? 0} / {checkpoint.maxAttempts ?? 5}
                      </span>
                    </div>
                    
                    {checkpoint.currentPlan && (
                      <div>
                        <h4 className="text-xs text-muted-foreground mb-2">Current Plan</h4>
                        <div className="space-y-2">
                          {checkpoint.currentPlan.steps.map((step: any, idx: number) => (
                            <div key={step.id || idx} className="flex items-center gap-2 p-2 bg-surface-1 rounded border border-border">
                              <span className={`w-2 h-2 rounded-full ${
                                step.status === 'completed' ? 'bg-green-500' :
                                step.status === 'running' ? 'bg-yellow-500' :
                                step.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                              }`} />
                              <span className="text-sm text-foreground flex-1">{step.description}</span>
                              <span className="text-xs text-muted-foreground">{step.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {checkpoint.lastObservation && (
                      <div>
                        <h4 className="text-xs text-muted-foreground mb-2">Last Observation</h4>
                        <div className={`p-3 rounded-lg border ${
                          checkpoint.lastObservation.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span>{checkpoint.lastObservation.success ? '✅' : '❌'}</span>
                            <span className="text-sm font-medium">{checkpoint.lastObservation.phase}</span>
                            <span className="text-xs text-muted-foreground">({checkpoint.lastObservation.durationMs}ms)</span>
                          </div>
                          {checkpoint.lastObservation.errors.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {checkpoint.lastObservation.errors.slice(0, 3).map((err: any, idx: number) => (
                                <div key={idx} className="text-xs text-red-400">
                                  {err.file && <span className="font-mono">{err.file}:{err.line} </span>}
                                  {err.message}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {checkpoint.lastReflection && (
                      <div>
                        <h4 className="text-xs text-muted-foreground mb-2">Last Reflection</h4>
                        <div className="p-3 bg-surface-1 rounded-lg border border-border">
                          <p className="text-sm text-foreground">{checkpoint.lastReflection.summary}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-muted-foreground">Confidence:</span>
                            <span className={`text-xs ${
                              checkpoint.lastReflection.confidence > 0.7 ? 'text-green-400' :
                              checkpoint.lastReflection.confidence > 0.4 ? 'text-yellow-400' : 'text-red-400'
                            }`}>{Math.round(checkpoint.lastReflection.confidence * 100)}%</span>
                            <span className="text-xs text-muted-foreground">→ {checkpoint.lastReflection.nextAction}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {checkpoint.sessionLogs && checkpoint.sessionLogs.length > 0 && (
                      <div>
                        <h4 className="text-xs text-muted-foreground mb-2">Session Logs</h4>
                        <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-xs bg-surface-1 rounded p-2">
                          {checkpoint.sessionLogs.slice(-20).map((log: any, idx: number) => (
                            <div key={idx} className={`flex items-start gap-2 ${
                              log.type === 'error' ? 'text-red-400' :
                              log.type === 'warning' ? 'text-yellow-400' :
                              log.type === 'success' ? 'text-green-400' :
                              log.type === 'adaptation' ? 'text-purple-400' : 'text-muted-foreground'
                            }`}>
                              <span className="text-muted-foreground shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                              <span>{log.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'discussion' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <select
                  value={newDecisionType}
                  onChange={(e) => setNewDecisionType(e.target.value)}
                  className="bg-surface-1 border border-border rounded-md px-2 py-2 text-sm text-foreground"
                >
                  <option value="proposal">Proposal</option>
                  <option value="critique">Critique</option>
                  <option value="decision">Decision</option>
                  <option value="architecture">Architecture</option>
                  <option value="api">API Design</option>
                  <option value="db">Database</option>
                </select>
                <input
                  type="text"
                  value={newDecision}
                  onChange={(e) => setNewDecision(e.target.value)}
                  placeholder="Add a proposal or decision..."
                  className="flex-1 bg-surface-1 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDecision()}
                />
                <button
                  onClick={handleAddDecision}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm"
                >
                  Add
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                {['all', 'proposal', 'critique', 'decision', 'architecture', 'api', 'db'].map(type => (
                  <button
                    key={type}
                    onClick={() => setDecisionFilter(type)}
                    className={`text-xs px-2 py-1 rounded ${
                      decisionFilter === type ? 'bg-primary text-primary-foreground' : 'bg-surface-1 text-muted-foreground'
                    }`}
                  >
                    {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              {decisions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No discussion entries yet
                </div>
              ) : (
                <div className="space-y-3">
                  {decisions
                    .filter((d: any) => decisionFilter === 'all' || d.type === decisionFilter)
                    .map((decision: any, idx: number) => (
                    <div key={idx} className="p-3 bg-surface-1 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          decision.type === 'proposal' ? 'bg-blue-500/20 text-blue-400' :
                          decision.type === 'critique' ? 'bg-orange-500/20 text-orange-400' :
                          decision.type === 'decision' ? 'bg-green-500/20 text-green-400' :
                          decision.type === 'architecture' ? 'bg-purple-500/20 text-purple-400' :
                          decision.type === 'api' ? 'bg-cyan-500/20 text-cyan-400' :
                          decision.type === 'db' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>{decision.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {decision.created_by} • {new Date(decision.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{decision.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'quality' && (
            <div className="space-y-4">
              {(() => {
                const metadata = task.metadata ? (typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata) : {}
                const quality = metadata.quality_metrics
                if (!quality) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No quality evaluation yet</p>
                      <p className="text-xs mt-2">Quality is evaluated after mission execution</p>
                    </div>
                  )
                }
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-semibold ${
                        quality.validation_status === 'passed' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {quality.validation_status === 'passed' ? '✅ Passed' : '❌ Failed'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-surface-1 rounded-lg">
                        <h4 className="text-xs text-muted-foreground mb-1">Completeness</h4>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${quality.completeness_score}%` }} />
                          </div>
                          <span className="text-sm">{Math.round(quality.completeness_score)}%</span>
                        </div>
                      </div>
                      <div className="p-3 bg-surface-1 rounded-lg">
                        <h4 className="text-xs text-muted-foreground mb-1">Quality</h4>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${quality.quality_score}%` }} />
                          </div>
                          <span className="text-sm">{Math.round(quality.quality_score)}%</span>
                        </div>
                      </div>
                      <div className="p-3 bg-surface-1 rounded-lg">
                        <h4 className="text-xs text-muted-foreground mb-1">Code Quality</h4>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500" style={{ width: `${quality.code_quality}%` }} />
                          </div>
                          <span className="text-sm">{Math.round(quality.code_quality)}%</span>
                        </div>
                      </div>
                      <div className="p-3 bg-surface-1 rounded-lg">
                        <h4 className="text-xs text-muted-foreground mb-1">Test Coverage</h4>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500" style={{ width: `${quality.test_coverage}%` }} />
                          </div>
                          <span className="text-sm">{Math.round(quality.test_coverage)}%</span>
                        </div>
                      </div>
                    </div>
                    {quality.issues.length > 0 && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <h4 className="text-xs text-red-400 mb-2">Issues Found</h4>
                        <ul className="space-y-1">
                          {quality.issues.map((issue: string, idx: number) => (
                            <li key={idx} className="text-sm text-red-300">⚠ {issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div>
              {artifacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No artifacts generated yet
                </div>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((artifact: any, idx: number) => (
                    <div key={idx} className="p-3 bg-surface-1 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">{artifact.name || artifact.type || 'Artifact'}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                          {artifact.type || 'file'}
                        </span>
                      </div>
                      {artifact.description && (
                        <p className="text-xs text-muted-foreground">{artifact.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Task execution logs</p>
              <p className="text-xs mt-2">Logs will appear here when the task is being executed by agents</p>
            </div>
          )}

          {activeTab === 'recovery' && (
            <div>
              {recoveryLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recovery events logged
                </div>
              ) : (
                <div className="space-y-3">
                  {recoveryLogs.map((log: any, idx: number) => (
                    <div key={idx} className="p-3 bg-surface-1 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          log.strategy === 'retry' ? 'bg-yellow-500/20 text-yellow-400' :
                          log.strategy === 'reassign' ? 'bg-blue-500/20 text-blue-400' :
                          log.strategy === 'fallback' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>{log.strategy || 'unknown'}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.timestamp || log.created_at).toLocaleString()}
                        </span>
                      </div>
                      {log.error && (
                        <p className="text-xs text-red-400 mb-1">Error: {log.error}</p>
                      )}
                      {log.message && (
                        <p className="text-sm text-foreground">{log.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {task.retry_count !== undefined && task.retry_count > 0 && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-400">Retry Attempts: {task.retry_count} / {task.max_retries || 3}</p>
                  {task.failure_type && (
                    <p className="text-xs text-muted-foreground mt-1">Last failure: {task.failure_type}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}