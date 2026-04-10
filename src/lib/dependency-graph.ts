import type { ParsedFile } from './codebase-indexer'

export interface DependencyNode {
  path: string
  imports: string[]
  importedBy: string[]
  depth: number
  isCircular: boolean
  circularWith?: string[]
}

export interface DependencyGraphResult {
  nodes: Map<string, DependencyNode>
  cycles: string[][]
  entryPoints: string[]
  leafNodes: string[]
  depth: number
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode>
  private processed: Set<string>

  constructor() {
    this.nodes = new Map()
    this.processed = new Set()
  }

  build(files: Map<string, ParsedFile>): DependencyGraphResult {
    this.nodes.clear()
    this.processed.clear()
    
    for (const [filePath, parsed] of files) {
      this.nodes.set(filePath, {
        path: filePath,
        imports: [],
        importedBy: [],
        depth: 0,
        isCircular: false,
      })
    }
    
    for (const [filePath, parsed] of files) {
      const node = this.nodes.get(filePath)!
      for (const imp of parsed.imports) {
        const resolved = this.resolveImport(filePath, imp.path, files)
        if (resolved && this.nodes.has(resolved)) {
          node.imports.push(resolved)
          this.nodes.get(resolved)!.importedBy.push(filePath)
        }
      }
    }
    
    this.calculateDepths()
    this.detectCycles()
    
    const cycles = this.findCycles()
    const entryPoints = this.findEntryPoints()
    const leafNodes = this.findLeafNodes()
    const maxDepth = this.calculateMaxDepth()
    
    return {
      nodes: this.nodes,
      cycles,
      entryPoints,
      leafNodes,
      depth: maxDepth,
    }
  }

  private resolveImport(fromFile: string, importPath: string, files: Map<string, ParsedFile>): string | null {
    const path = require('path')
    const dir = path.dirname(fromFile)
    const resolved = path.resolve(dir, importPath)
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx']
    const indexFiles = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']
    
    for (const ext of extensions) {
      const fullPath = resolved.endsWith(ext) ? resolved : resolved + ext
      if (files.has(fullPath)) {
        return fullPath
      }
    }
    
    for (const indexFile of indexFiles) {
      const fullPath = resolved + indexFile
      if (files.has(fullPath)) {
        return fullPath
      }
    }
    
    return null
  }

  private calculateDepths(): void {
    const visited = new Set<string>()
    const queue: string[] = []
    
    for (const [filePath, node] of this.nodes) {
      if (node.imports.length === 0) {
        node.depth = 0
        queue.push(filePath)
        visited.add(filePath)
      }
    }
    
    while (queue.length > 0) {
      const current = queue.shift()!
      const node = this.nodes.get(current)!
      
      for (const dep of node.imports) {
        const depNode = this.nodes.get(dep)
        if (depNode && !visited.has(dep)) {
          depNode.depth = Math.max(depNode.depth, node.depth + 1)
          visited.add(dep)
          queue.push(dep)
        }
      }
    }
  }

  private detectCycles(): void {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    
    for (const [filePath] of this.nodes) {
      if (!visited.has(filePath)) {
        this.detectCyclesDFS(filePath, visited, recursionStack)
      }
    }
  }

  private detectCyclesDFS(node: string, visited: Set<string>, recursionStack: Set<string>): boolean {
    visited.add(node)
    recursionStack.add(node)
    
    const nodeInfo = this.nodes.get(node)
    if (!nodeInfo) return false
    
    for (const dep of nodeInfo.imports) {
      if (!visited.has(dep)) {
        if (this.detectCyclesDFS(dep, visited, recursionStack)) {
          return true
        }
      } else if (recursionStack.has(dep)) {
        nodeInfo.isCircular = true
        nodeInfo.circularWith = nodeInfo.circularWith || []
        nodeInfo.circularWith.push(dep)
        return true
      }
    }
    
    recursionStack.delete(node)
    return false
  }

  findCycles(): string[][] {
    const cycles: string[][] = []
    const visited = new Set<string>()
    
    for (const [filePath, node] of this.nodes) {
      if (node.isCircular && !visited.has(filePath)) {
        const cycle = this.extractCycle(filePath)
        if (cycle.length > 0) {
          cycles.push(cycle)
          cycle.forEach(f => visited.add(f))
        }
      }
    }
    
    return cycles
  }

  private extractCycle(start: string): string[] {
    const cycle: string[] = []
    const visited = new Set<string>()
    const node = this.nodes.get(start)
    
    if (!node) return cycle
    
    let current = start
    while (current && !visited.has(current)) {
      visited.add(current)
      cycle.push(current)
      
      const nodeInfo = this.nodes.get(current)
      if (nodeInfo && nodeInfo.circularWith && nodeInfo.circularWith.length > 0) {
        current = nodeInfo.circularWith[0]
        if (visited.has(current)) break
      } else {
        break
      }
    }
    
    return cycle
  }

  private findEntryPoints(): string[] {
    const entryPoints: string[] = []
    
    for (const [filePath, node] of this.nodes) {
      if (node.importedBy.length === 0) {
        entryPoints.push(filePath)
      }
    }
    
    return entryPoints
  }

  private findLeafNodes(): string[] {
    const leaves: string[] = []
    
    for (const [filePath, node] of this.nodes) {
      if (node.imports.length === 0) {
        leaves.push(filePath)
      }
    }
    
    return leaves
  }

  private calculateMaxDepth(): number {
    let maxDepth = 0
    
    for (const [, node] of this.nodes) {
      if (node.depth > maxDepth) {
        maxDepth = node.depth
      }
    }
    
    return maxDepth
  }

  getTopologicalOrder(): string[] {
    const order: string[] = []
    const visited = new Set<string>()
    const temp = new Set<string>()
    
    for (const [filePath] of this.nodes) {
      if (!visited.has(filePath)) {
        this.topologicalSortDFS(filePath, visited, temp, order)
      }
    }
    
    return order
  }

  private topologicalSortDFS(
    node: string,
    visited: Set<string>,
    temp: Set<string>,
    order: string[]
  ): boolean {
    if (temp.has(node)) return false
    if (visited.has(node)) return true
    
    temp.add(node)
    
    const nodeInfo = this.nodes.get(node)
    if (nodeInfo) {
      for (const dep of nodeInfo.imports) {
        if (!this.topologicalSortDFS(dep, visited, temp, order)) {
          return false
        }
      }
    }
    
    temp.delete(node)
    visited.add(node)
    order.unshift(node)
    return true
  }

  getImpactSet(filePath: string): string[] {
    const affected = new Set<string>()
    const queue = [filePath]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      if (affected.has(current)) continue
      
      affected.add(current)
      
      const node = this.nodes.get(current)
      if (node) {
        for (const dep of node.importedBy) {
          if (!affected.has(dep)) {
            queue.push(dep)
          }
        }
      }
    }
    
    return Array.from(affected)
  }

  getDependencySet(filePath: string): string[] {
    const deps = new Set<string>()
    const queue = [filePath]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      if (deps.has(current)) continue
      
      deps.add(current)
      
      const node = this.nodes.get(current)
      if (node) {
        for (const dep of node.imports) {
          if (!deps.has(dep)) {
            queue.push(dep)
          }
        }
      }
    }
    
    return Array.from(deps)
  }

  findCommonAncestors(file1: string, file2: string): string[] {
    const ancestors1 = new Set(this.getDependencySet(file1))
    const ancestors2 = new Set(this.getDependencySet(file2))
    
    const common: string[] = []
    for (const anc of ancestors1) {
      if (ancestors2.has(anc)) {
        common.push(anc)
      }
    }
    
    return common
  }

  findShortestPath(from: string, to: string): string[] | null {
    if (from === to) return [from]
    
    const visited = new Set<string>()
    const queue: { node: string; path: string[] }[] = [{ node: from, path: [from] }]
    
    while (queue.length > 0) {
      const { node, path } = queue.shift()!
      
      if (visited.has(node)) continue
      visited.add(node)
      
      const nodeInfo = this.nodes.get(node)
      if (!nodeInfo) continue
      
      for (const dep of nodeInfo.imports) {
        if (dep === to) {
          return [...path, to]
        }
        
        if (!visited.has(dep)) {
          queue.push({ node: dep, path: [...path, dep] })
        }
      }
    }
    
    return null
  }
}