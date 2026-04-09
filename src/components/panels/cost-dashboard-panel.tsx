'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClientLogger } from '@/lib/client-logger'
import { CostMetrics } from '@/lib/telemetry'

const log = createClientLogger('CostDashboard')

export function CostDashboardPanel() {
  const t = useTranslations('telemetry')
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const [costs, setCosts] = useState<CostMetrics[]>([])

  useEffect(() => {
    fetchCostData()
  }, [period])

  const fetchCostData = async () => {
    try {
      const res = await fetch(`/api/telemetry/cost?period=${period}`)
      const data = await res.json()
      setCosts(data)
    } catch (err) {
      log.error('Failed to fetch cost data:', err)
    }
  }

  const getBudgetPercentage = (agent: string): number => {
    const agentCosts = costs.find((c) => c.agent_id === agent)
    const budget = 10
    if (!agentCosts) return 0
    return Math.min((agentCosts.total_cost_usd / budget) * 100, 100)
  }

  const formatCost = (usd: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }).format(usd)
  }

  if (costs.length === 0) {
    return (
      <div className="p-4">
        <div className="text-gray-500 text-center py-8">{t('noCostData')}</div>
        <div className="flex gap-2 mt-4">
          {['day', 'week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-4 py-2 rounded ${
                period === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        {['day', 'week', 'month'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p as any)}
            className={`px-4 py-2 rounded ${
              period === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {costs.map((cost) => (
          <div key={cost.agent_id} className="bg-gray-800 rounded p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <div className="w-32 text-gray-300">{cost.agent_id}</div>
                <div className="text-gray-500 text-sm">
                  {cost.period}: {cost.start_date} to {cost.end_date}
                </div>
              </div>
              <div className="text-blue-400 font-mono">{formatCost(cost.total_cost_usd)}</div>
            </div>

            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Budget</span>
                <span>$10.00</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    getBudgetPercentage(cost.agent_id) > 100
                      ? 'bg-red-600'
                      : getBudgetPercentage(cost.agent_id) > 70
                      ? 'bg-yellow-600'
                      : 'bg-green-600'
                  }`}
                  style={{ width: `${getBudgetPercentage(cost.agent_id)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 text-sm text-gray-400">
              <div>
                <div className="text-gray-500">Prompt</div>
                <div>{cost.total_prompt_tokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">Completion</div>
                <div>{cost.total_completion_tokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">Model</div>
                <div>{cost.model || 'mixed'}</div>
              </div>
              <div>
                <div className="text-gray-500">Tasks</div>
                <div>{cost.task_count}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
