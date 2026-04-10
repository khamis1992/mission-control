import { getDatabase } from './db'
import { logger } from './logger'

export interface CostEstimate {
  model: string
  estimatedTokens: number
  estimatedCost: number
  confidence: number
}

export interface ModelRecommendation {
  model: string
  useCase: string
  cost: number
  quality: 'excellent' | 'good' | 'adequate'
  latency: 'fast' | 'medium' | 'slow'
}

export interface TaskComplexity {
  reasoningLevel: 'simple' | 'moderate' | 'complex'
  codeGeneration: boolean
  securityCritical: boolean
  performanceCritical: boolean
  multiFile: boolean
}

const MODEL_SPECS: Record<string, { inputCost: number; outputCost: number; contextWindow: number }> = {
  'claude-opus': { inputCost: 15, outputCost: 75, contextWindow: 200000 },
  'claude-sonnet': { inputCost: 3, outputCost: 15, contextWindow: 200000 },
  'claude-haiku': { inputCost: 0.25, outputCost: 1.25, contextWindow: 200000 },
  'gpt-4o': { inputCost: 2.5, outputCost: 10, contextWindow: 128000 },
  'gpt-4o-mini': { inputCost: 0.15, outputCost: 0.6, contextWindow: 128000 }
}

const DEFAULT_TOKENS_PER_TASK = {
  simple: 3000,
  moderate: 8000,
  complex: 20000,
  security: 15000,
  performance: 12000
}

export class CostOptimizer {
  async predictCost(taskDescription: string, model: string): Promise<CostEstimate> {
    const complexity = await this.assessComplexity(taskDescription)
    const baseTokens = this.getBaseTokens(complexity)
    
    const spec = MODEL_SPECS[model] || MODEL_SPECS['claude-sonnet']
    const inputTokens = Math.floor(baseTokens * 0.6)
    const outputTokens = Math.floor(baseTokens * 0.4)
    
    const estimatedCost = (inputTokens / 1_000_000 * spec.inputCost) + 
                          (outputTokens / 1_000_000 * spec.outputCost)
    
    return {
      model,
      estimatedTokens: baseTokens,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      confidence: this.calculateConfidence(complexity)
    }
  }

  async selectOptimalModel(taskDescription: string): Promise<string> {
    const complexity = await this.assessComplexity(taskDescription)
    
    if (complexity.securityCritical) {
      return 'claude-opus'
    }
    if (complexity.reasoningLevel === 'simple' && !complexity.codeGeneration) {
      return 'claude-haiku'
    }
    if (complexity.performanceCritical) {
      return 'claude-sonnet'
    }
    
    return 'claude-sonnet'
  }

  async assessComplexity(taskDescription: string): Promise<TaskComplexity> {
    const descLower = taskDescription.toLowerCase()
    
    const securityKeywords = ['security', 'auth', 'password', 'credential', 'encryption', 'sanitize']
    const performanceKeywords = ['optimize', 'performance', 'cache', 'scale', 'fast']
    const codeGenKeywords = ['implement', 'create', 'build', 'write', 'generate', 'develop']
    
    const hasSecurity = securityKeywords.some(k => descLower.includes(k))
    const hasPerformance = performanceKeywords.some(k => descLower.includes(k))
    const hasCodeGen = codeGenKeywords.some(k => descLower.includes(k))
    
    const wordCount = taskDescription.split(/\s+/).length
    const isComplex = wordCount > 50 || hasSecurity || hasPerformance
    
    return {
      reasoningLevel: isComplex ? 'complex' : wordCount > 20 ? 'moderate' : 'simple',
      codeGeneration: hasCodeGen,
      securityCritical: hasSecurity,
      performanceCritical: hasPerformance,
      multiFile: descLower.includes('multiple') || descLower.includes('across')
    }
  }

  private getBaseTokens(complexity: TaskComplexity): number {
    let base = DEFAULT_TOKENS_PER_TASK[complexity.reasoningLevel]
    
    if (complexity.codeGeneration) base *= 1.5
    if (complexity.securityCritical) base *= 1.3
    if (complexity.performanceCritical) base *= 1.2
    if (complexity.multiFile) base *= 1.4
    
    return Math.floor(base)
  }

  private calculateConfidence(complexity: TaskComplexity): number {
    let confidence = 0.7
    
    if (complexity.securityCritical) confidence += 0.1
    if (complexity.performanceCritical) confidence += 0.1
    if (complexity.reasoningLevel === 'simple') confidence += 0.1
    
    return Math.min(confidence, 0.95)
  }

  getModelRecommendations(): ModelRecommendation[] {
    return [
      {
        model: 'claude-haiku',
        useCase: 'Simple queries, quick reviews, style checks',
        cost: 0.001,
        quality: 'adequate',
        latency: 'fast'
      },
      {
        model: 'claude-sonnet',
        useCase: 'Most tasks, code generation, standard development',
        cost: 0.015,
        quality: 'good',
        latency: 'medium'
      },
      {
        model: 'claude-opus',
        useCase: 'Complex reasoning, security-critical code, architecture',
        cost: 0.15,
        quality: 'excellent',
        latency: 'slow'
      }
    ]
  }

  async getHistoricalCosts(taskType: string, limit: number = 10): Promise<number> {
    const db = getDatabase()
    
    const records = db.prepare(`
      SELECT cost FROM token_records 
      WHERE task_id IS NOT NULL
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(limit) as { cost: number }[]
    
    if (records.length === 0) return 0
    
    const total = records.reduce((sum, r) => sum + r.cost, 0)
    return total / records.length
  }

  estimateBatchCost(tasks: { description: string; model: string }[]): number {
    let total = 0
    
    for (const task of tasks) {
      const spec = MODEL_SPECS[task.model] || MODEL_SPECS['claude-sonnet']
      total += (3000 / 1_000_000 * spec.inputCost) + 
               (2000 / 1_000_000 * spec.outputCost)
    }
    
    return Math.round(total * 100) / 100
  }
}

export const costOptimizer = new CostOptimizer()

export async function estimateTaskCost(taskDescription: string, model: string): Promise<CostEstimate> {
  return costOptimizer.predictCost(taskDescription, model)
}

export async function getOptimalModel(taskDescription: string): Promise<string> {
  return costOptimizer.selectOptimalModel(taskDescription)
}

export function getAvailableModels(): ModelRecommendation[] {
  return costOptimizer.getModelRecommendations()
}