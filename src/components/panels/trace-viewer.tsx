'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('TraceViewer')

export function TraceViewer({ traceId }: { traceId: string }) {
  const t = useTranslations('telemetry')
  const [trace, setTrace] = useState<any>(null)

  useEffect(() => {
    fetchTrace()
  }, [traceId])

  const fetchTrace = async () => {
    try {
      const res = await fetch(`/api/telemetry/trace/${traceId}`)
      const data = await res.json()
      setTrace(data)
    } catch (err) {
      log.error('Failed to fetch trace:', err)
    }
  }

  const formatCost = (usd: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }).format(usd)
  }

  const formatDuration = (ms?: number): string => {
    if (!ms) return 'N/A'
    const seconds = (ms / 1000).toFixed(2)
    return `${seconds}s`
  }

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const groupedEvents = useMemo(() => {
    if (!trace?.events) return {}
    const groups: Record<string, any[]> = {}
    trace.events.forEach((event: any) => {
      if (!groups[event.type]) groups[event.type] = []
      groups[event.type].push(event)
    })
    return groups
  }, [trace])

  if (!trace) {
    return <div className="text-center py-8 text-gray-500">{t('loading')}</div>
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Trace: {trace.id}</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-500">Task ID</div>
          <div className="text-lg font-mono">{trace.task_id}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-500">Duration</div>
          <div className="text-lg font-mono">{formatDuration(trace.duration_ms)}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-500">Cost</div>
          <div className="text-lg font-mono text-blue-400">{formatCost(trace.cost_usd)}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-500">Status</div>
          <div className={`text-lg font-bold ${trace.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>
            {trace.status.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded p-4">
        <h3 className="text-lg font-bold mb-4">Event Timeline</h3>
        <div className="space-y-2">
          <div className="flex gap-2 items-start">
            <div className="w-24 text-sm text-green-400">Session Start</div>
            <div className="text-gray-300">Session initialized</div>
          </div>

          {trace.events && trace.events.map((event: any, i: number) => (
            <div key={event.id} className="flex gap-2 items-start text-sm">
              <div className="w-24 text-gray-500 font-mono">{formatTime(event.timestamp)}</div>
              <div className="flex-1">
                <span
                  className={`px-2 py-1 rounded text-xs mr-2 ${
                    event.type === 'error'
                      ? 'bg-red-600'
                      : event.type === 'token_usage'
                      ? 'bg-blue-600'
                      : 'bg-gray-600'
                  }`}
                >
                  {event.type}
                </span>
                <span className="text-gray-300">{JSON.stringify(event.payload)}</span>
              </div>
            </div>
          ))}

          <div className="flex gap-2 items-start">
            <div className="w-24 text-sm text-green-400">Session End</div>
            <div className="text-gray-300">
              {trace.tokens?.prompt} prompt tokens, {trace.tokens?.completion} completion tokens
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
