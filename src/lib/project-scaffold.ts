/**
 * Project Scaffolding Engine
 * Generates project structure for AI Application Builder
 */

import { getDatabase } from './db'

export interface ProjectScaffold {
  id: number
  task_id: number
  project_type: 'nextjs-app' | 'nextjs-pages' | 'react-spa' | 'node-api' | 'python-api' | 'static'
  framework: string
  language: string
  database?: string
  styling: string
  file_tree: string
  created_at: number
  workspace_id: number
}

export interface FileTreeNode {
  name: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  content?: string
  language?: string
}

export interface ProjectAnalysis {
  project_type: ProjectScaffold['project_type']
  framework: string
  language: string
  database?: string
  styling: string
  description: string
}

export interface StackConfig {
  name: string
  framework: string
  language: string
  default_styling: string
  package_manager: string
  build_command: string
  dev_command: string
  file_structure: FileTreeNode[]
}

/**
 * Analyze user goal to determine project type
 */
export function analyzeGoal(goal: string): ProjectAnalysis {
  const goalLower = goal.toLowerCase()
  
  // Detect project type
  let project_type: ProjectScaffold['project_type'] = 'nextjs-app'
  let framework = 'next'
  let language = 'typescript'
  let database: string | undefined
  let styling = 'tailwind'
  
  // Framework detection
  if (goalLower.includes('next.js') || goalLower.includes('nextjs') || goalLower.includes('next js')) {
    project_type = 'nextjs-app'
    framework = 'next'
  } else if (goalLower.includes('react') || goalLower.includes('spa') || goalLower.includes('single page')) {
    project_type = 'react-spa'
    framework = 'react'
  } else if (goalLower.includes('node') || goalLower.includes('express') || goalLower.includes('api')) {
    project_type = 'node-api'
    framework = 'express'
  } else if (goalLower.includes('python') || goalLower.includes('fastapi') || goalLower.includes('django')) {
    project_type = 'python-api'
    framework = goalLower.includes('django') ? 'django' : 'fastapi'
    language = 'python'
  } else if (goalLower.includes('static') || goalLower.includes('landing') || goalLower.includes('portfolio')) {
    project_type = 'static'
    framework = 'html'
    language = 'html'
  }
  
  // Pages router detection for Next.js
  if (goalLower.includes('pages router') || goalLower.includes('pages directory')) {
    project_type = 'nextjs-pages'
  }
  
  // Database detection
  if (goalLower.includes('postgres') || goalLower.includes('postgresql')) {
    database = 'postgresql'
  } else if (goalLower.includes('mongodb') || goalLower.includes('mongo')) {
    database = 'mongodb'
  } else if (goalLower.includes('mysql')) {
    database = 'mysql'
  } else if (goalLower.includes('sqlite')) {
    database = 'sqlite'
  } else if (project_type !== 'static' && (goalLower.includes('database') || goalLower.includes('data') || goalLower.includes('storage'))) {
    database = 'sqlite' // Default for full-stack apps
  }
  
  // Language detection
  if (goalLower.includes('javascript') && !goalLower.includes('typescript')) {
    language = 'javascript'
  }
  
  // Styling detection
  if (goalLower.includes('css modules') || goalLower.includes('module css')) {
    styling = 'css-modules'
  } else if (goalLower.includes('styled-components') || goalLower.includes('styled components')) {
    styling = 'styled-components'
  } else if (goalLower.includes('emotion')) {
    styling = 'emotion'
  }
  
  return {
    project_type,
    framework,
    language,
    database,
    styling,
    description: goal
  }
}

/**
 * Get stack template configuration
 */
export function getStackTemplate(type: ProjectScaffold['project_type']): StackConfig {
  const templates: Record<ProjectScaffold['project_type'], StackConfig> = {
    'nextjs-app': {
      name: 'Next.js App Router',
      framework: 'next',
      language: 'typescript',
      default_styling: 'tailwind',
      package_manager: 'pnpm',
      build_command: 'next build',
      dev_command: 'next dev',
      file_structure: [
        {
          name: 'app',
          type: 'directory',
          children: [
            { name: 'page.tsx', type: 'file', language: 'typescript' },
            { name: 'layout.tsx', type: 'file', language: 'typescript' },
            { name: 'globals.css', type: 'file', language: 'css' }
          ]
        },
        {
          name: 'components',
          type: 'directory',
          children: []
        },
        { name: 'lib', type: 'directory', children: [] },
        { name: 'public', type: 'directory', children: [] },
        { name: 'package.json', type: 'file', language: 'json' },
        { name: 'tsconfig.json', type: 'file', language: 'json' },
        { name: 'tailwind.config.ts', type: 'file', language: 'typescript' }
      ]
    },
    'nextjs-pages': {
      name: 'Next.js Pages Router',
      framework: 'next',
      language: 'typescript',
      default_styling: 'tailwind',
      package_manager: 'pnpm',
      build_command: 'next build',
      dev_command: 'next dev',
      file_structure: [
        {
          name: 'pages',
          type: 'directory',
          children: [
            { name: 'index.tsx', type: 'file', language: 'typescript' },
            { name: '_app.tsx', type: 'file', language: 'typescript' }
          ]
        },
        {
          name: 'styles',
          type: 'directory',
          children: [
            { name: 'globals.css', type: 'file', language: 'css' }
          ]
        },
        {
          name: 'components',
          type: 'directory',
          children: []
        },
        { name: 'lib', type: 'directory', children: [] },
        { name: 'package.json', type: 'file', language: 'json' },
        { name: 'tsconfig.json', type: 'file', language: 'json' }
      ]
    },
    'react-spa': {
      name: 'React SPA',
      framework: 'react',
      language: 'typescript',
      default_styling: 'tailwind',
      package_manager: 'pnpm',
      build_command: 'vite build',
      dev_command: 'vite',
      file_structure: [
        {
          name: 'src',
          type: 'directory',
          children: [
            { name: 'App.tsx', type: 'file', language: 'typescript' },
            { name: 'main.tsx', type: 'file', language: 'typescript' },
            { name: 'index.css', type: 'file', language: 'css' }
          ]
        },
        {
          name: 'components',
          type: 'directory',
          children: []
        },
        { name: 'public', type: 'directory', children: [] },
        { name: 'package.json', type: 'file', language: 'json' },
        { name: 'tsconfig.json', type: 'file', language: 'json' },
        { name: 'vite.config.ts', type: 'file', language: 'typescript' }
      ]
    },
    'node-api': {
      name: 'Node.js API',
      framework: 'express',
      language: 'typescript',
      default_styling: 'none',
      package_manager: 'pnpm',
      build_command: 'tsc',
      dev_command: 'tsx watch src/index.ts',
      file_structure: [
        {
          name: 'src',
          type: 'directory',
          children: [
            { name: 'index.ts', type: 'file', language: 'typescript' },
            { name: 'routes', type: 'directory', children: [] },
            { name: 'middleware', type: 'directory', children: [] }
          ]
        },
        {
          name: 'tests',
          type: 'directory',
          children: []
        },
        { name: 'package.json', type: 'file', language: 'json' },
        { name: 'tsconfig.json', type: 'file', language: 'json' }
      ]
    },
    'python-api': {
      name: 'Python API',
      framework: 'fastapi',
      language: 'python',
      default_styling: 'none',
      package_manager: 'pip',
      build_command: '',
      dev_command: 'uvicorn main:app --reload',
      file_structure: [
        {
          name: 'app',
          type: 'directory',
          children: [
            { name: 'main.py', type: 'file', language: 'python' },
            { name: 'routes', type: 'directory', children: [] },
            { name: 'models', type: 'directory', children: [] }
          ]
        },
        { name: 'requirements.txt', type: 'file', language: 'text' },
        { name: 'pyproject.toml', type: 'file', language: 'toml' }
      ]
    },
    'static': {
      name: 'Static Site',
      framework: 'html',
      language: 'html',
      default_styling: 'css',
      package_manager: 'none',
      build_command: '',
      dev_command: '',
      file_structure: [
        { name: 'index.html', type: 'file', language: 'html' },
        { name: 'styles.css', type: 'file', language: 'css' },
        { name: 'scripts.js', type: 'file', language: 'javascript' }
      ]
    }
  }
  
  return templates[type]
}

/**
 * Generate scaffold structure
 */
export function generateScaffold(analysis: ProjectAnalysis): FileTreeNode[] {
  const template = getStackTemplate(analysis.project_type)
  return template.file_structure
}

/**
 * Store scaffold in database
 */
export async function storeScaffold(taskId: number, scaffold: Omit<ProjectScaffold, 'id' | 'created_at'>): Promise<number> {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  const result = db.prepare(`
    INSERT INTO project_scaffolds (
      task_id, project_type, framework, language, database, styling, file_tree, created_at, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scaffold.task_id,
    scaffold.project_type,
    scaffold.framework,
    scaffold.language,
    scaffold.database || null,
    scaffold.styling,
    scaffold.file_tree,
    now,
    scaffold.workspace_id
  )
  
  return result.lastInsertRowid as number
}

/**
 * Get scaffold by task ID
 */
export function getScaffoldByTaskId(taskId: number): ProjectScaffold | null {
  const db = getDatabase()
  return db.prepare('SELECT * FROM project_scaffolds WHERE task_id = ?').get(taskId) as ProjectScaffold | null
}