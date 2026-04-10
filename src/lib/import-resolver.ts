import * as path from 'path'
import * as fs from 'fs'
import type { ParsedFile, Import } from './codebase-indexer'

export interface ResolvedImport {
  originalPath: string
  resolvedPath: string | null
  isRelative: boolean
  isNodeModules: boolean
  isBuiltIn: boolean
  exists: boolean
}

export interface ImportResolutionResult {
  imports: ResolvedImport[]
  missingImports: string[]
  externalDependencies: string[]
  internalDependencies: string[]
}

const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'url', 'util', 'crypto', 'os', 'stream',
  'events', 'buffer', 'querystring', 'child_process', 'cluster', 'dgram',
  'dns', 'net', 'readline', 'repl', 'tls', 'tty', 'v8', 'vm', 'zlib',
  'worker_threads', 'perf_hooks', 'async_hooks', 'assert', 'constants',
  'domain', 'module', 'process', 'timers', 'console', 'global', 'Buffer',
])

export class ImportResolver {
  private projectRoot: string
  private parsedFiles: Map<string, ParsedFile>
  private pathAliases: Map<string, string>
  private extensions: string[]

  constructor(
    projectRoot: string,
    parsedFiles: Map<string, ParsedFile>,
    pathAliases: Record<string, string> = {}
  ) {
    this.projectRoot = projectRoot
    this.parsedFiles = parsedFiles
    this.pathAliases = new Map(Object.entries(pathAliases))
    this.extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  }

  resolveImports(filePath: string): ImportResolutionResult {
    const parsed = this.parsedFiles.get(filePath)
    if (!parsed) {
      return {
        imports: [],
        missingImports: [],
        externalDependencies: [],
        internalDependencies: [],
      }
    }

    const imports: ResolvedImport[] = []
    const missingImports: string[] = []
    const externalDependencies = new Set<string>()
    const internalDependencies = new Set<string>()

    for (const imp of parsed.imports) {
      const resolved = this.resolveImport(filePath, imp.path)
      imports.push(resolved)

      if (!resolved.exists && !resolved.isBuiltIn) {
        missingImports.push(imp.path)
      }

      if (resolved.isNodeModules && !resolved.isBuiltIn) {
        const pkgName = this.extractPackageName(imp.path)
        if (pkgName) {
          externalDependencies.add(pkgName)
        }
      }

      if (resolved.resolvedPath && !resolved.isNodeModules) {
        internalDependencies.add(resolved.resolvedPath)
      }
    }

    return {
      imports,
      missingImports: Array.from(missingImports),
      externalDependencies: Array.from(externalDependencies),
      internalDependencies: Array.from(internalDependencies),
    }
  }

  resolveImport(fromFile: string, importPath: string): ResolvedImport {
    const isRelative = importPath.startsWith('./') || importPath.startsWith('../')
    const isBuiltIn = NODE_BUILTINS.has(importPath) || importPath.startsWith('node:')
    const isNodeModules = !isRelative && !isBuiltIn && !importPath.startsWith('.')

    let resolvedPath: string | null = null
    let exists = false

    if (isBuiltIn) {
      return {
        originalPath: importPath,
        resolvedPath: null,
        isRelative: false,
        isNodeModules: false,
        isBuiltIn: true,
        exists: true,
      }
    }

    if (isRelative) {
      resolvedPath = this.resolveRelativeImport(fromFile, importPath)
    } else {
      const aliasResolved = this.resolvePathAlias(importPath)
      if (aliasResolved) {
        resolvedPath = this.resolveAbsoluteImport(aliasResolved)
      } else {
        resolvedPath = this.resolveNodeModulesImport(importPath)
      }
    }

    exists = resolvedPath !== null && this.parsedFiles.has(resolvedPath)

    return {
      originalPath: importPath,
      resolvedPath,
      isRelative,
      isNodeModules,
      isBuiltIn,
      exists,
    }
  }

  private resolveRelativeImport(fromFile: string, importPath: string): string | null {
    const dir = path.dirname(fromFile)
    const absolutePath = path.resolve(dir, importPath)
    
    return this.resolveAbsoluteImport(absolutePath)
  }

  private resolveAbsoluteImport(absolutePath: string): string | null {
    for (const ext of this.extensions) {
      const withExt = absolutePath.endsWith(ext) ? absolutePath : absolutePath + ext
      if (this.parsedFiles.has(withExt)) {
        return withExt
      }
    }

    for (const ext of this.extensions) {
      const indexPath = path.join(absolutePath, `index${ext}`)
      if (this.parsedFiles.has(indexPath)) {
        return indexPath
      }
    }

    return null
  }

  private resolvePathAlias(importPath: string): string | null {
    for (const [alias, target] of this.pathAliases) {
      if (importPath.startsWith(alias + '/') || importPath === alias) {
        const rest = importPath.slice(alias.length)
        return path.join(target, rest)
      }
    }
    return null
  }

  private resolveNodeModulesImport(importPath: string): string | null {
    const pkgName = this.extractPackageName(importPath)
    if (!pkgName) return null
    
    const rest = importPath.slice(pkgName.length)
    
    const possiblePaths = [
      path.join(this.projectRoot, 'node_modules', pkgName, rest),
      path.join(this.projectRoot, '..', 'node_modules', pkgName, rest),
    ]

    for (const basePath of possiblePaths) {
      const resolved = this.resolveAbsoluteImport(basePath)
      if (resolved && this.parsedFiles.has(resolved)) {
        return resolved
      }
    }

    return null
  }

  private extractPackageName(importPath: string): string | null {
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/')
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`
      }
    } else {
      const parts = importPath.split('/')
      return parts[0] || null
    }
    return null
  }

  findUnusedExports(filePath: string): string[] {
    const parsed = this.parsedFiles.get(filePath)
    if (!parsed) return []

    const unusedExports: string[] = []
    const exportedNames = new Set(parsed.exports.map(e => e.name))

    for (const exp of parsed.exports) {
      const isUsed = this.isExportUsed(filePath, exp.name)
      if (!isUsed) {
        unusedExports.push(exp.name)
      }
    }

    return unusedExports
  }

  private isExportUsed(filePath: string, exportName: string): boolean {
    for (const [otherPath, otherParsed] of this.parsedFiles) {
      if (otherPath === filePath) continue
      
      for (const imp of otherParsed.imports) {
        const names = imp.names || []
        if (names.includes(exportName)) {
          const resolved = this.resolveImport(otherPath, imp.path)
          if (resolved.resolvedPath === filePath) {
            return true
          }
        }
      }
    }

    return false
  }

  findCircularDependencies(): string[][] {
    const circular: string[][] = []
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const currentPath: string[] = []

    for (const [filePath] of this.parsedFiles) {
      if (!visited.has(filePath)) {
        this.detectCycles(filePath, visited, recursionStack, currentPath, circular)
      }
    }

    return circular
  }

  private detectCycles(
    filePath: string,
    visited: Set<string>,
    recursionStack: Set<string>,
    currentPath: string[],
    circular: string[][]
  ): void {
    visited.add(filePath)
    recursionStack.add(filePath)
    currentPath.push(filePath)

    const parsed = this.parsedFiles.get(filePath)
    if (parsed) {
      for (const imp of parsed.imports) {
        const resolved = this.resolveImport(filePath, imp.path)
        if (resolved.resolvedPath) {
          if (!visited.has(resolved.resolvedPath)) {
            this.detectCycles(resolved.resolvedPath, visited, recursionStack, currentPath, circular)
          } else if (recursionStack.has(resolved.resolvedPath)) {
            const cycleStart = currentPath.indexOf(resolved.resolvedPath)
            if (cycleStart !== -1) {
              circular.push([...currentPath.slice(cycleStart), resolved.resolvedPath])
            }
          }
        }
      }
    }

    recursionStack.delete(filePath)
    currentPath.pop()
  }

  suggestImports(filePath: string, symbolName: string): string[] {
    const suggestions: string[] = []

    for (const [otherPath, otherParsed] of this.parsedFiles) {
      if (otherPath === filePath) continue

      for (const exp of otherParsed.exports) {
        if (exp.name === symbolName) {
          const relativePath = this.getRelativeImportPath(filePath, otherPath)
          suggestions.push(relativePath)
        }
      }
    }

    return suggestions
  }

  private getRelativeImportPath(fromFile: string, toFile: string): string {
    const fromDir = path.dirname(fromFile)
    const relative = path.relative(fromDir, toFile)
    const normalized = relative.replace(/\\/g, '/')
    return normalized.startsWith('.') ? normalized : './' + normalized
  }

  getImportStats(): {
    totalFiles: number
    totalImports: number
    totalExports: number
    avgImportsPerFile: number
    avgExportsPerFile: number
    mostImportedFiles: string[]
    mostExportedFiles: string[]
  } {
    let totalImports = 0
    let totalExports = 0
    const importCounts = new Map<string, number>()
    const exportCounts = new Map<string, number>()

    for (const [filePath, parsed] of this.parsedFiles) {
      totalImports += parsed.imports.length
      totalExports += parsed.exports.length

      const resolved = this.resolveImports(filePath)
      for (const imp of resolved.internalDependencies) {
        importCounts.set(imp, (importCounts.get(imp) || 0) + 1)
      }

      exportCounts.set(filePath, parsed.exports.length)
    }

    const sortedImports = Array.from(importCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path]) => path)

    const sortedExports = Array.from(exportCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path]) => path)

    return {
      totalFiles: this.parsedFiles.size,
      totalImports,
      totalExports,
      avgImportsPerFile: this.parsedFiles.size > 0 ? totalImports / this.parsedFiles.size : 0,
      avgExportsPerFile: this.parsedFiles.size > 0 ? totalExports / this.parsedFiles.size : 0,
      mostImportedFiles: sortedImports,
      mostExportedFiles: sortedExports,
    }
  }
}