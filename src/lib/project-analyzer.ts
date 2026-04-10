import { getDatabase } from './db'

export interface ProjectAnalysis {
  id: number
  task_id: number
  project_type: 'nextjs-app' | 'nextjs-pages' | 'react-spa' | 'node-api' | 'python-api' | 'static' | 'unknown'
  framework: string
  language: string
  database?: string
  styling: string
  complexity: 'simple' | 'moderate' | 'complex' | 'enterprise'
  estimated_files: number
  estimated_hours: number
  tech_stack: string[]
  issues: AnalyzedIssue[]
  recommendations: string[]
  created_at: number
  workspace_id: number
}

export interface AnalyzedIssue {
  type: 'security' | 'performance' | 'best_practices' | 'compatibility' | 'maintenance'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  file?: string
  suggestion: string
}

export function analyzeProject(taskId: number, workspaceId: number): ProjectAnalysis {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(taskId, workspaceId) as any

  if (!task) {
    throw new Error(`Task ${taskId} not found in workspace ${workspaceId}`)
  }

  const goal = task.description || task.title
  const goalLower = goal.toLowerCase()

  let project_type: ProjectAnalysis['project_type'] = 'unknown'
  let framework = 'unknown'
  let language = 'unknown'
  let database: string | undefined
  let styling = 'unknown'
  let complexity: ProjectAnalysis['complexity'] = 'simple'
  let estimatedFiles = 0
  let estimatedHours = 0
  const techStack: string[] = []
  const issues: AnalyzedIssue[] = []
  const recommendations: string[] = []

  if (goalLower.includes('next.js') || goalLower.includes('nextjs') || goalLower.includes('next js')) {
    project_type = 'nextjs-app'
    framework = 'next'
    language = 'typescript'
    techStack.push('Next.js', 'React', 'TypeScript')
  } else if (goalLower.includes('react') || goalLower.includes('spa')) {
    project_type = 'react-spa'
    framework = 'react'
    language = 'typescript'
    techStack.push('React', 'TypeScript', 'Vite')
  } else if (goalLower.includes('node') || goalLower.includes('express') || goalLower.includes('api')) {
    project_type = 'node-api'
    framework = 'express'
    language = 'javascript'
    techStack.push('Node.js', 'Express', 'JavaScript')
  } else if (goalLower.includes('python') || goalLower.includes('fastapi') || goalLower.includes('django')) {
    project_type = 'python-api'
    framework = goalLower.includes('django') ? 'django' : 'fastapi'
    language = 'python'
    techStack.push('Python', goalLower.includes('django') ? 'Django' : 'FastAPI')
  } else if (goalLower.includes('static') || goalLower.includes('landing') || goalLower.includes('portfolio')) {
    project_type = 'static'
    framework = 'html'
    language = 'html'
    techStack.push('HTML', 'CSS', 'JavaScript')
  }

  if (goalLower.includes('postgres') || goalLower.includes('postgresql')) {
    database = 'postgresql'
    techStack.push('PostgreSQL')
  } else if (goalLower.includes('mongodb') || goalLower.includes('mongo')) {
    database = 'mongodb'
    techStack.push('MongoDB')
  } else if (goalLower.includes('mysql')) {
    database = 'mysql'
    techStack.push('MySQL')
  } else if (goalLower.includes('sqlite')) {
    database = 'sqlite'
    techStack.push('SQLite')
  }

  if (goalLower.includes('tailwind')) {
    styling = 'tailwind'
    techStack.push('Tailwind CSS')
  } else if (goalLower.includes('css modules') || goalLower.includes('cssm')) {
    styling = 'modules'
    techStack.push('CSS Modules')
  } else if (goalLower.includes('bootstrap')) {
    styling = 'bootstrap'
    techStack.push('Bootstrap')
  }

  const complexityFactors = [
    goalLower.includes('enterprise') ? 3 : 0,
    goalLower.includes('microservice') || goalLower.includes('microservices') ? 4 : 0,
    goalLower.includes('real-time') || goalLower.includes('websocket') ? 2 : 0,
    goalLower.includes('graphql') ? 2 : 0,
    goalLower.includes('authentication') || goalLower.includes('auth') ? 1 : 0,
    goalLower.includes('payment') || goalLower.includes('stripe') ? 3 : 0,
    goalLower.includes('docker') || goalLower.includes('kubernetes') ? 2 : 0,
  ]

  const complexityScore = complexityFactors.reduce((sum, val) => sum + val, 0)
  if (complexityScore === 0) {
    complexity = 'simple'
  } else if (complexityScore <= 3) {
    complexity = 'moderate'
  } else if (complexityScore <= 7) {
    complexity = 'complex'
  } else {
    complexity = 'enterprise'
  }

  estimatedFiles = complexity === 'simple' ? 5 : complexity === 'moderate' ? 15 : complexity === 'complex' ? 30 : 50
  estimatedHours = complexity === 'simple' ? 4 : complexity === 'moderate' ? 16 : complexity === 'complex' ? 40 : 80

  if (project_type === 'unknown' && complexity !== 'simple') {
    issues.push({
      type: 'compatibility',
      severity: 'medium',
      message: 'Project type not explicitly specified. Consider adding framework/framework keywords.',
      suggestion: 'Update task description with explicit framework mentions like "Next.js", "React", etc.'
    })
  }

  if (!database && complexity !== 'simple') {
    issues.push({
      type: 'best_practices',
      severity: 'high',
      message: 'Database layer not specified for a complex application.',
      suggestion: 'Add database specification (PostgreSQL, MongoDB, etc.) to task description.'
    })
  }

  if (estimatedFiles > 20) {
    recommendations.push('Consider breaking this project into microservices for better maintainability')
  }

  if (goalLower.includes('docker') || goalLower.includes('container')) {
    recommendations.push('Use Docker Compose for local development and testing')
  }

  const analysisId = db
    .prepare(`
      INSERT INTO project_analyses 
        (task_id, project_type, framework, language, database, styling, complexity, 
         estimated_files, estimated_hours, tech_stack, issues, recommendations, created_at, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(taskId, project_type, framework, language, database, styling, complexity,
         estimatedFiles, estimatedHours, JSON.stringify(techStack), JSON.stringify(issues),
         JSON.stringify(recommendations), now, workspaceId).lastInsertRowid as number

  return {
    id: analysisId,
    task_id: taskId,
    project_type,
    framework,
    language,
    database,
    styling,
    complexity,
    estimated_files: estimatedFiles,
    estimated_hours: estimatedHours,
    tech_stack: techStack,
    issues,
    recommendations,
    created_at: now,
    workspace_id: workspaceId
  }
}

export function getProjectAnalysis(taskId: number, workspaceId: number): ProjectAnalysis | null {
  const db = getDatabase()

  const result = db
    .prepare(`
      SELECT * FROM project_analyses 
      WHERE task_id = ? AND workspace_id = ? 
      ORDER BY created_at DESC LIMIT 1
    `)
    .get(taskId, workspaceId) as any

  if (!result) return null

  return {
    ...result,
    tech_stack: result.tech_stack ? JSON.parse(result.tech_stack) : [],
    issues: result.issues ? JSON.parse(result.issues) : [],
    recommendations: result.recommendations ? JSON.parse(result.recommendations) : [],
  }
}

export function deleteProjectAnalysis(taskId: number, workspaceId: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM project_analyses WHERE task_id = ? AND workspace_id = ?')
    .run(taskId, workspaceId)
}

export function updateProjectAnalysis(analysisId: number, updates: Partial<ProjectAnalysis>): void {
  const db = getDatabase()

  if (!analysisId) {
    throw new Error('Analysis ID is required')
  }

  const updatesObj: any = {
    ...updates,
    tech_stack: updates.tech_stack ? JSON.stringify(updates.tech_stack) : undefined,
    issues: updates.issues ? JSON.stringify(updates.issues) : undefined,
    recommendations: updates.recommendations ? JSON.stringify(updates.recommendations) : undefined,
  }

  const setClauses: string[] = []
  const values: any[] = []

  for (const [key, value] of Object.entries(updatesObj)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (setClauses.length === 0) return

  values.push(analysisId)

  db.prepare(`UPDATE project_analyses SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)
}

export function listProjectAnalyses(workspaceId: number): ProjectAnalysis[] {
  const db = getDatabase()

  const results = db
    .prepare(`
      SELECT * FROM project_analyses 
      WHERE workspace_id = ? 
      ORDER BY created_at DESC
    `)
    .all(workspaceId) as any[]

  return results.map(result => ({
    ...result,
    tech_stack: result.tech_stack ? JSON.parse(result.tech_stack) : [],
    issues: result.issues ? JSON.parse(result.issues) : [],
    recommendations: result.recommendations ? JSON.parse(result.recommendations) : [],
  }))
}
