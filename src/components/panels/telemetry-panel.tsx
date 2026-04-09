'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { TraceSession } from '@/lib/telemetry'

const log = createClientLogger('Telemetry')

export function TelemetryPanel() {
  const t = useTranslations('telemetry')
  const [filters, setFilters] = useState({
    agent: '',
    startDate: '',
    endDate: '',
    type: 'all',
  })
  const [traces, setTraces] = useState<TraceSession[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTraces = async () => {
    setLoading(true)
    try {
      let url = '/api/telemetry?'
      if (filters.agent) url += `&agent=${encodeURIComponent(filters.agent)}`
      if (filters.startDate) url += `&start=${filters.startDate}`
      if (filters.endDate) url += `&end=${filters.endDate}`
      if (filters.type !== 'all') url += `&type=${filters.type}`

      const res = await fetch(url)
      const data = await res.json()
      setTraces(data)
    } catch (err) {
      log.error('Failed to fetch traces:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTraces()
  }, [filters])

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

  return (
    <div className="p-4">
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <input
          type="text"
          placeholder="Filter by agent..."
          value={filters.agent}
          onChange={(e) => setFilters({ ...filters, agent: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
        />

        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
        />

        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
        >
          <option value="all">All Types</option>
          <option value="agent_start">Agent Start</option>
          <option value="token_usage">Token Usage</option>
          <option value="error">Errors</option>
        </select>
      </div>

      {loading ? (
        <Loader variant="panel" label={t('loading')} />
      ) : traces.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t('noTraces')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800 text-gray-200">
              <tr>
                <th className="p-2">Task ID</th>
                <th className="p-2">Agent</th>
                <th className="p-2">Duration</th>
                <th className="p-2">Prompt Tokens</th>
                <th className="p-2">Completion Tokens</th>
                <th className="p-2">Cost</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr key={trace.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="p-2">{trace.task_id}</td>
                  <td className="p-2">{trace.agent_id}</td>
                  <td className="p-2">{formatDuration(trace.duration_ms)}</td>
                  <td className="p-2">{trace.tokens.prompt}</td>
                  <td className="p-2">{trace.tokens.completion}</td>
                  <td className="p-2 text-blue-400 font-mono">{formatCost(trace.cost_usd)}</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        trace.status === 'completed'
                          ? 'bg-green-600'
                          : trace.status === 'failed'
                          ? 'bg-red-600'
                          : 'bg-yellow-600'
                      }`}
                    >
                      {trace.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
