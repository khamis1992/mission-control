import { CodebaseIndexer, type ParsedFile, type CodebaseIndex } from './codebase-indexer'
import { DependencyGraph, type DependencyGraphResult } from './dependency-graph'
import { ImportResolver, type ImportResolutionResult } from './import-resolver'
import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { logger } from './logger'
import type { SessionCheckpoint } from './session-manager'
import * as path from 'path'

export interface FileIntelligenceContext {
  projectId: number
  workspaceId: number
  projectRoot: string
  lastIndexed: number
  indexHash: string
}

export interface IntelligenceReport {
  relevantFiles: string[]
  dependencies: string[]
  dependents: string[]
  suggestedImports: string[]
  unusedExports: string[]
  circularDependencies: string[][]
  riskAreas: RiskArea[]
}

export interface RiskArea {
  file: string
  type: 'high_coupling' | 'circular_dependency' | 'unused_exports' | 'missing_imports'
  severity: 'low' | 'medium' | 'high'
  description: string
  affectedFiles: string[]
}

export class FileIntelligence {
  private indexer: CodebaseIndexer
  private dependencyGraph: DependencyGraph
  private importResolver: ImportResolver | null = null
  private context: FileIntelligenceContext | null = null
  private index: CodebaseIndex | null = null

  constructor() {
    this.indexer = new CodebaseIndexer('', [])
    this.dependencyGraph = new DependencyGraph()
  }

  async initialize(projectRoot: string): Promise<void> {
    this.context = {
      projectId: 0,
      workspaceId: 0,
      projectRoot,
      lastIndexed: 0,
      indexHash: '',
    }

    this.indexer = new CodebaseIndexer(projectRoot)
    this.index = await this.indexer.indexCodebase()
    this.dependencyGraph = new DependencyGraph()
    this.dependencyGraph.build(this.index.files)
    this.importResolver = new ImportResolver(projectRoot, this.index.files)
    
    this.context.lastIndexed = Date.now()
    
    eventBus.broadcast('file_intelligence.indexed', {
      projectRoot,
      fileCount: this.index.files.size,
      timestamp: this.context.lastIndexed,
    })
  }

  getContext(session: SessionCheckpoint): IntelligenceReport | null {
    if (!this.index || !this.importResolver) {
      return null
    }

    const relevantFiles = new Set<string>()
    const dependencies = new Set<string>()
    const dependents = new Set<string>()

    if (session.currentPlan) {
      for (const step of session.currentPlan.steps) {
        this.findRelevantFiles(step.description, relevantFiles)
      }
    }

    if (session.lastObservation?.artifacts) {
      for (const artifact of session.lastObservation.artifacts) {
        if (artifact.path) {
          relevantFiles.add(artifact.path)
        }
      }
    }

    if (session.lastAdaptation?.changes) {
      for (const change of session.lastAdaptation.changes) {
        if (change.file) {
          relevantFiles.add(change.file)
        }
      }
    }

    for (const file of relevantFiles) {
      const deps = this.indexer.getDependencies(file)
      if (deps) {
        deps.forEach(d => dependencies.add(d))
      }

      const depents = this.indexer.getDependents(file)
      if (depents) {
        depents.forEach(d => dependents.add(d))
      }
    }

    const suggestedImports: string[] = []
    const unusedExports: string[] = []

    if (this.importResolver && relevantFiles.size > 0) {
      const firstFile = Array.from(relevantFiles)[0]
      const firstParsed = this.index.files.get(firstFile)
      
      if (firstParsed) {
        for (const imp of firstParsed.imports) {
          if (imp.path.startsWith('.') && !imp.resolved) {
            const suggestions = this.importResolver.suggestImports(firstFile, imp.names[0] || '')
            suggestedImports.push(...suggestions)
          }
        }

        const unused = this.importResolver.findUnusedExports(firstFile)
        unusedExports.push(...unused)
      }
    }

    const circularDependencies = this.dependencyGraph.findCycles()
    const riskAreas = this.identifyRiskAreas(relevantFiles, circularDependencies)

    return {
      relevantFiles: Array.from(relevantFiles),
      dependencies: Array.from(dependencies),
      dependents: Array.from(dependents),
      suggestedImports,
      unusedExports,
      circularDependencies,
      riskAreas,
    }
  }

  private findRelevantFiles(description: string, files: Set<string>): void {
    if (!this.index) return

    const keywords = description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)

    for (const [filePath, parsed] of this.index.files) {
      const fileName = filePath.toLowerCase()
      const fileContent = JSON.stringify(parsed).toLowerCase()

      for (const keyword of keywords) {
        if (fileName.includes(keyword) || fileContent.includes(keyword)) {
          files.add(filePath)
          break
        }
      }
    }

    for (const [name, location] of this.index.exportMap) {
      for (const keyword of keywords) {
        if (name.toLowerCase().includes(keyword)) {
          files.add(location.file)
        }
      }
    }
  }

  private identifyRiskAreas(relevantFiles: Set<string>, cycles: string[][]): RiskArea[] {
    const risks: RiskArea[] = []

    for (const cycle of cycles) {
      const affectedFiles = cycle.filter(f => relevantFiles.has(f))
      if (affectedFiles.length > 0) {
        risks.push({
          file: cycle[0],
          type: 'circular_dependency',
          severity: 'high',
          description: `Circular dependency detected: ${cycle.join(' → ')}`,
          affectedFiles,
        })
      }
    }

    for (const file of relevantFiles) {
      const deps = this.indexer.getDependencies(file)
      if (deps && deps.size > 10) {
        risks.push({
          file,
          type: 'high_coupling',
          severity: 'medium',
          description: `File has ${deps.size} imports - high coupling`,
          affectedFiles: Array.from(deps),
        })
      }
    }

    return risks
  }

  getFile(file: string): ParsedFile | undefined {
    return this.indexer.getFile(file)
  }

  getDependencies(file: string): string[] | undefined {
    const deps = this.indexer.getDependencies(file)
    return deps ? Array.from(deps) : undefined
  }

  getDependents(file: string): string[] | undefined {
    const depents = this.indexer.getDependents(file)
    return depents ? Array.from(depents) : undefined
  }

  resolveImport(file: string, importPath: string): string | null {
    if (!this.importResolver) return null
    const resolved = this.importResolver.resolveImport(file, importPath)
    return resolved.resolvedPath
  }

  getAffectedFiles(file: string): string[] {
    return this.indexer.getAffectedFiles(file)
  }

  getExport(name: string): { file: string; export: { name: string; type: string; line: number } } | undefined {
    return this.indexer.findExport(name)
  }

  getFileByExport(name: string): string | undefined {
    return this.indexer.getFileByExport(name)
  }

  getImportStats() {
    if (!this.importResolver) return null
    return this.importResolver.getImportStats()
  }

  getDependencyStats() {
    const result = this.dependencyGraph.build(this.index?.files || new Map())
    return {
      totalFiles: result.nodes.size,
      entryPoints: result.entryPoints.length,
      leafNodes: result.leafNodes.length,
      maxDepth: result.depth,
      cycles: result.cycles.length,
    }
  }

  async saveToDatabase(projectId: number): Promise<void> {
    if (!this.index || !this.context) return

    const db = getDatabase()
    
    const files = Array.from(this.index.files.entries()).map(([filePath, parsed]) => {
      const { path: _unused, ...rest } = parsed as ParsedFile & { path?: string }
      return { path: filePath, ...rest }
    })
    
    const depGraph = Array.from(this.index.dependencyGraph.entries()).map(([filePath, deps]) => ({
      path: filePath,
      deps: Array.from(deps),
    }))
    
    const indexData = JSON.stringify({
      files,
      dependencyGraph: depGraph,
    })

    db.prepare(`
      INSERT OR REPLACE INTO project_intelligence (project_id, index_data, last_indexed)
      VALUES (?, ?, ?)
    `).run(projectId, indexData, Math.floor(Date.now() / 1000))
  }

  async loadFromDatabase(projectId: number): Promise<boolean> {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT index_data, last_indexed FROM project_intelligence WHERE project_id = ?
    `).get(projectId) as { index_data: string; last_indexed: number } | undefined

    if (!row) return false

    try {
      const indexData = JSON.parse(row.index_data)
      this.index = {
        files: new Map(indexData.files.map((f: any) => [f.path, f])),
        dependencyGraph: new Map(indexData.dependencyGraph.map((d: any) => [d.path, new Set(d.deps)])),
        reverseDependencyGraph: new Map(),
        exportMap: new Map(),
        lastIndexed: row.last_indexed * 1000,
      }

      for (const [path, parsed] of this.index.files) {
        for (const exp of parsed.exports) {
          this.index.exportMap.set(exp.name, { file: path, export: exp })
        }
      }

      for (const [file, deps] of this.index.dependencyGraph) {
        for (const dep of deps) {
          if (!this.index.reverseDependencyGraph.has(dep)) {
            this.index.reverseDependencyGraph.set(dep, new Set())
          }
          this.index.reverseDependencyGraph.get(dep)!.add(file)
        }
      }

      return true
    } catch (error) {
      logger.error({ error, projectId }, 'Failed to load file intelligence from database')
      return false
    }
  }
}

export const fileIntelligence = new FileIntelligence()