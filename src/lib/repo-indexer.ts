import { getDatabase } from './db'
import { logger } from './logger'
import { config } from './config'
import { join, relative, extname } from 'path'
import { readdir, readFile, stat, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

export interface IndexedFile {
  path: string
  content: string
  language: string
  size: number
  modified: number
}

export interface KnowledgeNode {
  id: string
  type: 'file' | 'function' | 'class' | 'interface' | 'module'
  name: string
  location?: string
  relationships: string[]
}

export interface IndexResult {
  projectId: number
  fileCount: number
  nodeCount: number
  indexedAt: number
  errors: string[]
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
}

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.data',
  'coverage',
  '.cache',
  '*.lock',
  '.env*',
  '*.log',
]

export class RepositoryIndexer {
  private indexDir: string
  private lastIndexTime: number = 0

  constructor() {
    this.indexDir = join(config.dataDir, 'repo-index')
  }

  async ensureIndexDir(): Promise<void> {
    if (!existsSync(this.indexDir)) {
      await mkdir(this.indexDir, { recursive: true })
    }
  }

  shouldIgnore(path: string): boolean {
    return IGNORE_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace('*', '.*') + '$')
        return regex.test(path)
      }
      return path.includes(pattern)
    })
  }

  async scanDirectory(dir: string, baseDir: string): Promise<IndexedFile[]> {
    const files: IndexedFile[] = []

    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const relativePath = relative(baseDir, fullPath)

        if (this.shouldIgnore(relativePath)) continue

        if (entry.isDirectory()) {
          const subFiles = await this.scanDirectory(fullPath, baseDir)
          files.push(...subFiles)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          const language = LANGUAGE_EXTENSIONS[ext]

          if (language) {
            try {
              const stats = await stat(fullPath)
              const content = await readFile(fullPath, 'utf-8')
              
              files.push({
                path: relativePath,
                content,
                language,
                size: stats.size,
                modified: stats.mtimeMs
              })
            } catch (err) {
              logger.debug({ err, path: relativePath }, 'Failed to read file')
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err, dir }, 'Failed to scan directory')
    }

    return files
  }

  async indexProject(projectPath: string, projectId: number): Promise<IndexResult> {
    await this.ensureIndexDir()
    const errors: string[] = []

    logger.info({ projectId, projectPath }, 'Starting repository indexing')

    const files = await this.scanDirectory(projectPath, projectPath)
    const nodes = this.extractKnowledgeNodes(files)

    const indexData = {
      projectId,
      indexedAt: Date.now(),
      files: files.map(f => ({
        path: f.path,
        language: f.language,
        size: f.size
      })),
      nodes,
      lastIndex: this.lastIndexTime
    }

    const indexPath = join(this.indexDir, `project-${projectId}.json`)
    await writeFile(indexPath, JSON.stringify(indexData, null, 2))

    this.lastIndexTime = Date.now()

    logger.info({ 
      projectId, 
      fileCount: files.length, 
      nodeCount: nodes.length 
    }, 'Repository indexing complete')

    return {
      projectId,
      fileCount: files.length,
      nodeCount: nodes.length,
      indexedAt: Date.now(),
      errors
    }
  }

  extractKnowledgeNodes(files: IndexedFile[]): KnowledgeNode[] {
    const nodes: KnowledgeNode[] = []

    for (const file of files) {
      const moduleName = file.path.replace(extname(file.path), '')
      
      nodes.push({
        id: `file:${file.path}`,
        type: 'file',
        name: file.path,
        location: file.path,
        relationships: []
      })

      if (file.language === 'typescript' || file.language === 'javascript') {
        const funcMatches = file.content.matchAll(/(?:function|const|let|var)\s+(\w+)/g)
        for (const match of funcMatches) {
          nodes.push({
            id: `func:${file.path}:${match[1]}`,
            type: 'function',
            name: match[1],
            location: `${file.path}`,
            relationships: [`file:${file.path}`]
          })
        }

        const classMatches = file.content.matchAll(/class\s+(\w+)/g)
        for (const match of classMatches) {
          nodes.push({
            id: `class:${file.path}:${match[1]}`,
            type: 'class',
            name: match[1],
            location: `${file.path}`,
            relationships: [`file:${file.path}`]
          })
        }

        const interfaceMatches = file.content.matchAll(/interface\s+(\w+)/g)
        for (const match of interfaceMatches) {
          nodes.push({
            id: `interface:${file.path}:${match[1]}`,
            type: 'interface',
            name: match[1],
            location: `${file.path}`,
            relationships: [`file:${file.path}`]
          })
        }
      }

      if (file.language === 'python') {
        const funcMatches = file.content.matchAll(/def\s+(\w+)/g)
        for (const match of funcMatches) {
          nodes.push({
            id: `func:${file.path}:${match[1]}`,
            type: 'function',
            name: match[1],
            location: `${file.path}`,
            relationships: [`file:${file.path}`]
          })
        }

        const classMatches = file.content.matchAll(/class\s+(\w+)/g)
        for (const match of classMatches) {
          nodes.push({
            id: `class:${file.path}:${match[1]}`,
            type: 'class',
            name: match[1],
            location: `${file.path}`,
            relationships: [`file:${file.path}`]
          })
        }
      }
    }

    return nodes
  }

  async getIndex(projectId: number): Promise<any | null> {
    const indexPath = join(this.indexDir, `project-${projectId}.json`)
    
    if (!existsSync(indexPath)) {
      return null
    }

    try {
      const content = await readFile(indexPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      logger.error({ err, projectId }, 'Failed to read index')
      return null
    }
  }

  async search(projectId: number, query: string): Promise<KnowledgeNode[]> {
    const index = await this.getIndex(projectId)
    
    if (!index) {
      return []
    }

    const queryLower = query.toLowerCase()
    return index.nodes.filter((node: KnowledgeNode) => 
      node.name.toLowerCase().includes(queryLower) ||
      node.location?.toLowerCase().includes(queryLower)
    )
  }

  generateMermaidDiagram(projectId: number): string {
    const indexData = {
      nodes: [] as KnowledgeNode[],
      files: [] as { path: string }[]
    }

    try {
      const indexPath = join(this.indexDir, `project-${projectId}.json`)
      const content = require('fs').readFileSync(indexPath, 'utf-8')
      const parsed = JSON.parse(content)
      indexData.nodes = parsed.nodes || []
      indexData.files = parsed.files || []
    } catch {
      return 'graph TD\n  A[No index available]'
    }

    const files = indexData.files.slice(0, 20)
    const classes = indexData.nodes.filter((n: KnowledgeNode) => n.type === 'class')
    const functions = indexData.nodes.filter((n: KnowledgeNode) => n.type === 'function')

    let diagram = 'graph TD\n'

    for (const file of files) {
      const safeName = file.path.replace(/[^a-zA-Z0-9]/g, '_')
      diagram += `  F_${safeName}["${file.path}"]\n`
    }

    for (const cls of classes.slice(0, 10)) {
      const safeName = cls.name.replace(/[^a-zA-Z0-9]/g, '_')
      diagram += `  C_${safeName}["class ${cls.name}"]\n`
    }

    for (const func of functions.slice(0, 10)) {
      const safeName = func.name.replace(/[^a-zA-Z0-9]/g, '_')
      diagram += `  FN_${safeName}["${func.name}()"]\n`
    }

    return diagram
  }
}

export const repositoryIndexer = new RepositoryIndexer()

export async function indexProject(projectId: number, projectPath: string): Promise<IndexResult> {
  return repositoryIndexer.indexProject(projectPath, projectId)
}

export async function searchProject(projectId: number, query: string): Promise<KnowledgeNode[]> {
  return repositoryIndexer.search(projectId, query)
}