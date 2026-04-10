'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export function ProjectAnalysisTab({ taskId }: { taskId: number }) {
  const t = useTranslations('projectAnalysis')
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/analysis`)
      .then(r => r.json())
      .then(data => {
        setAnalysis(data.analysis || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [taskId])

  if (loading) return <div className="p-4">{t('loading')}</div>
  if (!analysis) return <div className="p-4 text-muted-foreground">{t('noAnalysis')}</div>

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">{t('projectType')}</div>
          <div className="font-medium">{analysis.project_type}</div>
        </div>
        <div className="bg-card p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">{t('framework')}</div>
          <div className="font-medium">{analysis.framework}</div>
        </div>
        <div className="bg-card p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">{t('language')}</div>
          <div className="font-medium">{analysis.language}</div>
        </div>
        <div className="bg-card p-4 rounded-lg">
          <div className="text-sm text-muted-foreground">{t('complexity')}</div>
          <div className={`font-medium ${analysis.complexity === 'complex' || analysis.complexity === 'enterprise' ? 'text-orange-500' : ''}`}>
            {analysis.complexity}
          </div>
        </div>
      </div>

      <div className="bg-card p-4 rounded-lg">
        <h3 className="font-medium mb-3">{t('techStack')}</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.tech_stack?.map((tech: string, i: number) => (
            <span key={i} className="px-2 py-1 bg-muted rounded text-sm">
              {tech}
            </span>
          ))}
        </div>
      </div>

      {analysis.issues?.length > 0 && (
        <div className="bg-card p-4 rounded-lg">
          <h3 className="font-medium mb-3 text-red-500">{t('issues')} ({analysis.issues.length})</h3>
          <div className="space-y-2">
            {analysis.issues.map((issue: any, i: number) => (
              <div key={i} className="border-l-4 border-red-500 pl-4 py-1">
                <div className="text-sm font-medium">{issue.severity}: {issue.message}</div>
                <div className="text-xs text-muted-foreground mt-1">{t('suggestion')}: {issue.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.recommendations?.length > 0 && (
        <div className="bg-card p-4 rounded-lg">
          <h3 className="font-medium mb-3 text-green-500">{t('recommendations')}</h3>
          <ul className="list-disc list-inside space-y-1">
            {analysis.recommendations.map((rec: string, i: number) => (
              <li key={i} className="text-sm">{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function IterationPlanningTab({ taskId }: { taskId: number }) {
  const t = useTranslations('iteration')
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/iterate`)
      .then(r => r.json())
      .then(data => {
        setPlan(data.iterations?.[0] || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [taskId])

  if (loading) return <div className="p-4">{t('loading')}</div>
  if (!plan) return <div className="p-4 text-muted-foreground">{t('noPlan')}</div>

  return (
    <div className="p-4 space-y-4">
      <div className="bg-card p-4 rounded-lg">
        <h3 className="font-medium text-lg mb-2">{plan.name}</h3>
        <p className="text-muted-foreground">{plan.goal}</p>
      </div>

      {plan.scope?.features?.length > 0 && (
        <div className="bg-card p-4 rounded-lg">
          <h3 className="font-medium mb-2">{t('features')}</h3>
          {plan.scope.features.map((f: string, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1 border-b last:border-0">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <span className="text-sm">{f}</span>
            </div>
          ))}
        </div>
      )}

      {plan.scope?.files?.length > 0 && (
        <div className="bg-card p-4 rounded-lg">
          <h3 className="font-medium mb-2">{t('files')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {plan.scope.files.map((f: string, i: number) => (
              <div key={i} className="text-sm bg-muted/50 p-2 rounded">
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.tasks?.length > 0 && (
        <div className="bg-card p-4 rounded-lg">
          <h3 className="font-medium mb-2">{t('tasks')}</h3>
          <div className="space-y-2">
            {plan.tasks.map((task: any, i: number) => (
              <div key={i} className="bg-card p-3 rounded text-sm">
                <div className="font-medium">{task.title}</div>
                <div className="text-muted-foreground text-xs mt-1">{task.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TimelineTab({ taskId }: { taskId: number }) {
  const t = useTranslations('timeline')
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/timeline`)
      .then(r => r.json())
      .then(data => {
        setTasks(data.tasks || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [taskId])

  if (loading) return <div className="p-4">{t('loading')}</div>

  return (
    <div className="p-4">
      <div className="relative border-l-2 border-primary/20 ml-3 space-y-6">
        {tasks.map((task: any, i: number) => (
          <div key={i} className="relative pl-6">
            <div className="absolute -left-[9px] top-0 w-4 h-4 bg-primary rounded-full border-4 border-background"></div>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{task.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(task.created_at * 1000).toLocaleString()}
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${
                task.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                task.status === 'in_progress' ? 'bg-blue-500/20 text-blue-500' :
                'bg-muted'
              }`}>
                {task.status}
              </span>
            </div>
            {task.description && (
              <div className="text-sm text-muted-foreground mt-2">{task.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DependenciesTab({ taskId }: { taskId: number }) {
  const t = useTranslations('dependencies')
  const [dependencies, setDependencies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/dependencies`)
      .then(r => r.json())
      .then(data => {
        setDependencies(data.dependencies || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [taskId])

  if (loading) return <div className="p-4">{t('loading')}</div>

  return (
    <div className="p-4">
      {dependencies.length === 0 ? (
        <div className="text-muted-foreground text-center py-8">{t('noDependencies')}</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card p-4 rounded-lg">
            <h3 className="font-medium mb-3">{t('dependencies')}</h3>
            <div className="space-y-2">
              {dependencies.map((dep: any, i: number) => (
                <div key={i} className="bg-muted/50 p-3 rounded flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full"></span>
                  <div>
                    <div className="font-medium text-sm">{dep.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {dep.impact || 'No impact specified'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {dependencies.length > 1 && (
            <div className="bg-card p-4 rounded-lg">
              <h3 className="font-medium mb-2">{t('impactAnalysis')}</h3>
              <div className="text-sm text-muted-foreground">
                {dependencies.length} dependencies detected. Changes to these tasks will affect the main workflow.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
