import { getDatabase } from './db'
import { logger } from './logger'
import { callClaudeDirectly } from './task-dispatch'

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'security' | 'correctness' | 'performance' | 'style'
  description: string
  location?: string
  suggestion?: string
}

export interface ReviewResult {
  passed: boolean
  issues: ReviewIssue[]
  iterations: number
  finalCode?: string
  reason?: string
}

export interface CodeToReview {
  code: string
  filePath?: string
  language?: string
  taskDescription?: string
}

interface TaskInput {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string
  workspace_id: number
  agent_name: string
  agent_id: number
  agent_config: string | null
  ticket_prefix: string | null
  project_ticket_no: number | null
  project_id: number | null
}

export class SelfReviewLoop {
  private maxIterations: number

  constructor(options?: { maxIterations?: number }) {
    this.maxIterations = options?.maxIterations ?? 3
  }

  async execute(
    taskId: number,
    code: CodeToReview,
    workspaceId: number
  ): Promise<ReviewResult> {
    let currentCode = code.code
    let iterations = 0

    for (iterations = 1; iterations <= this.maxIterations; iterations++) {
      logger.info({ taskId, iteration: iterations }, 'Self-review: spawning reviewer')

      const review = await this.spawnReviewer(taskId, currentCode, code, workspaceId)

      if (review.issues.length === 0) {
        logger.info({ taskId, iterations }, 'Self-review: PASSED')
        return { passed: true, issues: [], iterations, finalCode: currentCode }
      }

      const criticalIssues = review.issues.filter(i => i.severity === 'critical')
      logger.warn({ 
        taskId, 
        issueCount: review.issues.length,
        criticalCount: criticalIssues.length
      }, 'Self-review: issues found')

      logger.info({ taskId, iteration: iterations }, 'Self-review: spawning fixer')
      currentCode = await this.spawnFixer(taskId, currentCode, review.issues, code, workspaceId)
    }

    logger.error({ taskId, iterations }, 'Self-review: max iterations reached')
    return {
      passed: false,
      issues: [],
      iterations,
      finalCode: currentCode,
      reason: 'max_iterations_reached'
    }
  }

  private async spawnReviewer(
    taskId: number,
    code: string,
    codeInfo: CodeToReview,
    workspaceId: number
  ): Promise<{ issues: ReviewIssue[] }> {
    const rubric = `
## Quality Rubric (evaluate against these):

### Security (30%)
- Hardcoded credentials or secrets
- SQL injection vulnerabilities  
- XSS vulnerabilities
- Insecure file handling
- Missing authentication/authorization

### Correctness (35%)
- Logic errors and off-by-one mistakes
- Incorrect algorithm implementation
- Missing edge case handling
- Incorrect error handling
- Functional bugs

### Performance (15%)
- N+1 query patterns
- Memory leaks
- Inefficient algorithms (O(n²) when O(n) possible)
- Missing caching opportunities
- Unnecessary computations

### Style (20%)
- Unused imports or variables
- Inconsistent naming
- Missing documentation
- Code duplication
- Poor error messages
`

    const prompt = `You are an INDEPENDENT CODE REVIEWER. Review the following code thoroughly.

${rubric}

${codeInfo.taskDescription ? `Task Context: ${codeInfo.taskDescription}` : ''}
${codeInfo.filePath ? `File: ${codeInfo.filePath}` : ''}
${codeInfo.language ? `Language: ${codeInfo.language}` : ''}

CODE TO REVIEW:
\`\`\`
${code}
\`\`\`

Return ONLY a JSON array of issues found. Each issue must have:
- severity: "critical", "high", "medium", or "low"
- category: "security", "correctness", "performance", or "style"  
- description: what is wrong
- location: file:line if known
- suggestion: how to fix

If NO issues found, return: []`

    try {
      const reviewTask = this.createReviewTask(taskId, workspaceId)
      const response = await callClaudeDirectly(reviewTask, prompt)
      
      const text = response.text || '[]'
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const issues = JSON.parse(cleaned) as ReviewIssue[]
      
      return { issues }
    } catch (error) {
      logger.error({ err: error, taskId }, 'Self-review: reviewer failed')
      return { issues: [] }
    }
  }

  private async spawnFixer(
    taskId: number,
    code: string,
    issues: ReviewIssue[],
    codeInfo: CodeToReview,
    workspaceId: number
  ): Promise<string> {
    const issuesList = issues.map((issue, i) => 
      `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}
         ${issue.location ? `Location: ${issue.location}` : ''}
         Fix: ${issue.suggestion || 'Fix appropriately'}`
    ).join('\n')

    const prompt = `You are a CODE FIXER. Fix the following issues in the code.

TASK: ${codeInfo.taskDescription || 'Fix code issues'}

ISSUES TO FIX:
${issuesList}

CURRENT CODE:
\`\`\`
${code}
\`\`\`

Requirements:
1. Fix ALL issues listed above
2. Do NOT introduce new issues
3. Maintain the same functionality
4. Keep consistent style with existing code
5. If an issue is unclear, make a reasonable fix

Return ONLY the fixed code, no explanations.`

    try {
      const fixTask = this.createFixerTask(taskId, workspaceId)
      const response = await callClaudeDirectly(fixTask, prompt)
      
      return response.text || code
    } catch (error) {
      logger.error({ err: error, taskId }, 'Self-review: fixer failed')
      return code
    }
  }

  private createReviewTask(parentTaskId: number, workspaceId: number): TaskInput {
    return {
      id: 0,
      title: `Review for task ${parentTaskId}`,
      description: 'Independent code review',
      status: 'inbox',
      priority: 'medium',
      assigned_to: 'reviewer',
      workspace_id: workspaceId,
      agent_name: 'reviewer',
      agent_id: 0,
      agent_config: null,
      ticket_prefix: null,
      project_ticket_no: null,
      project_id: null
    }
  }

  private createFixerTask(parentTaskId: number, workspaceId: number): TaskInput {
    return {
      id: 0,
      title: `Fix for task ${parentTaskId}`,
      description: 'Auto-fix code issues',
      status: 'inbox',
      priority: 'high',
      assigned_to: 'fixer',
      workspace_id: workspaceId,
      agent_name: 'fixer',
      agent_id: 0,
      agent_config: null,
      ticket_prefix: null,
      project_ticket_no: null,
      project_id: null
    }
  }
}

export async function executeWithSelfReview(
  taskId: number,
  code: string,
  codeInfo: CodeToReview,
  workspaceId: number
): Promise<ReviewResult> {
  const reviewer = new SelfReviewLoop({ maxIterations: 3 })
  return reviewer.execute(taskId, { ...codeInfo, code }, workspaceId)
}

export async function quickReview(code: string, codeInfo?: CodeToReview): Promise<ReviewIssue[]> {
  const prompt = `Perform a QUICK security and correctness review.

${codeInfo?.taskDescription ? `Context: ${codeInfo.taskDescription}` : ''}

CODE:
\`\`\`
${code}
\`\`\`

Return ONLY critical and high severity issues. Ignore style.
Return JSON array with severity, category, description.`

  try {
    const task: TaskInput = {
      id: 0,
      title: 'Quick review',
      description: '',
      status: 'inbox',
      priority: 'low',
      assigned_to: 'system',
      workspace_id: 0,
      agent_name: 'system',
      agent_id: 0,
      agent_config: null,
      ticket_prefix: null,
      project_ticket_no: null,
      project_id: null
    }
    const response = await callClaudeDirectly(task, prompt)
    
    const text = response.text || '[]'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as ReviewIssue[]
  } catch {
    return []
  }
}

export function storeReviewResult(taskId: number, result: ReviewResult): void {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  const existing = db.prepare('SELECT metadata FROM tasks WHERE id = ?').get(taskId) as any
  let metadata = {}
  if (existing?.metadata) {
    metadata = typeof existing.metadata === 'string' 
      ? JSON.parse(existing.metadata) 
      : existing.metadata
  }
  
  metadata = {
    ...metadata,
    self_review: {
      passed: result.passed,
      iterations: result.iterations,
      issues_count: result.issues.length,
      reason: result.reason,
      reviewed_at: now
    }
  }
  
  db.prepare('UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(metadata), now, taskId)
}

export const selfReviewLoop = new SelfReviewLoop()