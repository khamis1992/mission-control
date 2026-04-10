import { promises as fs } from 'fs'
import * as path from 'path'

export interface ParsedFile {
  path: string
  language: string
  imports: Import[]
  exports: Export[]
  classes: ClassInfo[]
  functions: FunctionInfo[]
  variables: VariableInfo[]
  dependencies: string[]
  lastModified: number
}

export interface Import {
  path: string
  names: string[]
  isDefault: boolean
  isNamespace: boolean
  line: number
  resolved?: string
}

export interface Export {
  name: string
  type: 'function' | 'class' | 'variable' | 'type' | 'interface'
  line: number
  isDefault: boolean
  isNamed: boolean
}

export interface ClassInfo {
  name: string
  extends?: string
  implements: string[]
  methods: MethodInfo[]
  properties: PropertyInfo[]
  line: number
  endLine: number
}

export interface FunctionInfo {
  name: string
  parameters: Parameter[]
  returnType?: string
  isAsync: boolean
  isExported: boolean
  line: number
  endLine: number
}

export interface VariableInfo {
  name: string
  type?: string
  isConst: boolean
  isExported: boolean
  line: number
}

export interface MethodInfo {
  name: string
  parameters: Parameter[]
  returnType?: string
  isAsync: boolean
  isStatic: boolean
  visibility: 'public' | 'private' | 'protected'
}

export interface PropertyInfo {
  name: string
  type?: string
  visibility: 'public' | 'private' | 'protected'
  isStatic: boolean
}

export interface Parameter {
  name: string
  type?: string
  isOptional: boolean
  defaultValue?: string
}

export interface CodebaseIndex {
  files: Map<string, ParsedFile>
  dependencyGraph: Map<string, Set<string>>
  reverseDependencyGraph: Map<string, Set<string>>
  exportMap: Map<string, { file: string; export: Export }>
  lastIndexed: number
}

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py', '.pyw'],
  go: ['.go'],
  rust: ['.rs'],
  java: ['.java'],
  kotlin: ['.kt', '.kts'],
  swift: ['.swift'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
  csharp: ['.cs'],
  ruby: ['.rb', '.rake'],
}

const EXT_TO_LANGUAGE: Record<string, string> = Object.entries(LANGUAGE_EXTENSIONS).reduce(
  (acc, [lang, exts]) => {
    for (const ext of exts) {
      acc[ext] = lang
    }
    return acc
  },
  {} as Record<string, string>
)

export class CodebaseIndexer {
  private index: CodebaseIndex
  private projectRoot: string
  private excludePatterns: RegExp[]

  constructor(projectRoot: string, excludePatterns: string[] = []) {
    this.projectRoot = projectRoot
    this.index = {
      files: new Map(),
      dependencyGraph: new Map(),
      reverseDependencyGraph: new Map(),
      exportMap: new Map(),
      lastIndexed: 0,
    }
    this.excludePatterns = excludePatterns.map(p => new RegExp(p))
  }

  async indexCodebase(): Promise<CodebaseIndex> {
    const files = await this.discoverFiles()
    
    for (const file of files) {
      try {
        const parsed = await this.parseFile(file)
        if (parsed) {
          this.index.files.set(file, parsed)
        }
      } catch (error) {
        console.error(`Failed to parse ${file}:`, error)
      }
    }
    
    this.buildDependencyGraph()
    this.buildExportMap()
    this.index.lastIndexed = Date.now()
    
    return this.index
  }

  private async discoverFiles(): Promise<string[]> {
    const files: string[] = []
    const queue: string[] = [this.projectRoot]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      
      try {
        const entries = await fs.readdir(current, { withFileTypes: true })
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue
          }
          
          const fullPath = path.join(current, entry.name)
          const relativePath = path.relative(this.projectRoot, fullPath)
          
          if (this.excludePatterns.some(p => p.test(relativePath))) {
            continue
          }
          
          if (entry.isDirectory()) {
            queue.push(fullPath)
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name)
            if (EXT_TO_LANGUAGE[ext]) {
              files.push(fullPath)
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    return files
  }

  private async parseFile(filePath: string): Promise<ParsedFile | null> {
    const ext = path.extname(filePath)
    const language = EXT_TO_LANGUAGE[ext]
    
    if (!language) {
      return null
    }
    
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const stats = await fs.stat(filePath)
      
      const parsed = this.parseContent(content, language, filePath)
      
      return {
        path: filePath,
        language,
        imports: parsed.imports,
        exports: parsed.exports,
        classes: parsed.classes,
        functions: parsed.functions,
        variables: parsed.variables,
        dependencies: parsed.dependencies,
        lastModified: stats.mtimeMs,
      }
    } catch (error) {
      return null
    }
  }

  private parseContent(
    content: string,
    language: string,
    filePath: string
  ): {
    imports: Import[]
    exports: Export[]
    classes: ClassInfo[]
    functions: FunctionInfo[]
    variables: VariableInfo[]
    dependencies: string[]
  } {
    const imports: Import[] = []
    const exports: Export[] = []
    const classes: ClassInfo[] = []
    const functions: FunctionInfo[] = []
    const variables: VariableInfo[] = []
    const dependencies: string[] = []
    
    if (language === 'typescript' || language === 'javascript') {
      this.parseTypeScript(content, imports, exports, classes, functions, variables, dependencies)
    } else if (language === 'python') {
      this.parsePython(content, imports, exports, classes, functions, variables, dependencies)
    } else if (language === 'go') {
      this.parseGo(content, imports, exports, classes, functions, variables, dependencies)
    }
    
    return { imports, exports, classes, functions, variables, dependencies }
  }

  private parseTypeScript(
    content: string,
    imports: Import[],
    exports: Export[],
    classes: ClassInfo[],
    functions: FunctionInfo[],
    variables: VariableInfo[],
    dependencies: string[]
  ): void {
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // Import statements
      const importMatch = trimmed.match(/^import\s+(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/)
      if (importMatch) {
        const names = importMatch[1]?.split(',').map(n => n.trim().split(' as ').pop()!) || []
        const isDefault = !!importMatch[2]
        const isNamespace = !!importMatch[3]
        const modulePath = importMatch[4]
        
        imports.push({
          path: modulePath,
          names: isDefault ? [importMatch[2]] : isNamespace ? [importMatch[3]] : names,
          isDefault,
          isNamespace,
          line: i + 1,
        })
        
        if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) {
          dependencies.push(modulePath.split('/')[0])
        }
      }
      
      // Export statements - named exports
      const namedExportMatch = trimmed.match(/^export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/)
      if (namedExportMatch) {
        exports.push({
          name: namedExportMatch[1],
          type: this.getExportType(trimmed),
          line: i + 1,
          isDefault: false,
          isNamed: true,
        })
      }
      
      // Export statements - default exports
      const defaultExportMatch = trimmed.match(/^export\s+default\s+(?:function\s+)?(\w+)?/)
      if (defaultExportMatch) {
        exports.push({
          name: defaultExportMatch[1] || 'default',
          type: 'function',
          line: i + 1,
          isDefault: true,
          isNamed: false,
        })
      }
      
      // Class declarations
      const classMatch = trimmed.match(/^export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/)
      if (classMatch) {
        const className = classMatch[1]
        const extendsClass = classMatch[2]
        const implementsInterfaces = classMatch[3]?.split(',').map(s => s.trim()) || []
        
        const classInfo: ClassInfo = {
          name: className,
          extends: extendsClass,
          implements: implementsInterfaces,
          methods: [],
          properties: [],
          line: i + 1,
          endLine: this.findBlockEnd(lines, i),
        }
        
        this.parseClassBody(lines, i, classInfo)
        classes.push(classInfo)
      }
      
      // Function declarations
      const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/)
      if (funcMatch) {
        functions.push({
          name: funcMatch[1],
          parameters: this.parseParameters(funcMatch[2]),
          isAsync: trimmed.includes('async'),
          isExported: trimmed.startsWith('export'),
          line: i + 1,
          endLine: this.findBlockEnd(lines, i),
        })
      }
      
      // Arrow functions and const declarations
      const constMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?s*=/)
      if (constMatch && !trimmed.includes('class')) {
        variables.push({
          name: constMatch[1],
          isConst: true,
          isExported: trimmed.startsWith('export'),
          line: i + 1,
        })
      }
    }
  }

  private parsePython(
    content: string,
    imports: Import[],
    exports: Export[],
    classes: ClassInfo[],
    functions: FunctionInfo[],
    variables: VariableInfo[],
    dependencies: string[]
  ): void {
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // Import statements
      const importMatch = trimmed.match(/^import\s+(\w+)|^from\s+(\w+)(?:\.\w+)*\s+import\s+(.+)/)
      if (importMatch) {
        const moduleName = importMatch[1] || importMatch[2]
        imports.push({
          path: moduleName,
          names: importMatch[3]?.split(',').map(s => s.trim()) || [moduleName],
          isDefault: false,
          isNamespace: false,
          line: i + 1,
        })
        dependencies.push(moduleName.split('.')[0])
      }
      
      // Class declarations
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?:/)
      if (classMatch) {
        const className = classMatch[1]
        const baseClass = classMatch[2]?.split(',')[0]?.trim()
        
        classes.push({
          name: className,
          extends: baseClass,
          implements: [],
          methods: [],
          properties: [],
          line: i + 1,
          endLine: this.findPythonBlockEnd(lines, i),
        })
      }
      
      // Function declarations
      const funcMatch = trimmed.match(/^def\s+(\w+)\s*\(([^)]*)\):/)
      if (funcMatch) {
        functions.push({
          name: funcMatch[1],
          parameters: this.parsePythonParameters(funcMatch[2]),
          isAsync: false,
          isExported: false,
          line: i + 1,
          endLine: this.findPythonBlockEnd(lines, i),
        })
      }
    }
  }

  private parseGo(
    content: string,
    imports: Import[],
    exports: Export[],
    classes: ClassInfo[],
    functions: FunctionInfo[],
    variables: VariableInfo[],
    dependencies: string[]
  ): void {
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // Import statements
      if (trimmed.startsWith('import ')) {
        const matches = trimmed.match(/"([^"]+)"/g)
        if (matches) {
          for (const match of matches) {
            const modulePath = match.slice(1, -1)
            imports.push({
              path: modulePath,
              names: [],
              isDefault: false,
              isNamespace: false,
              line: i + 1,
            })
            dependencies.push(modulePath.split('/')[0])
          }
        }
      }
      
      // Function declarations
      const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/)
      if (funcMatch) {
        functions.push({
          name: funcMatch[1],
          parameters: this.parseGoParameters(funcMatch[2]),
          isAsync: false,
          isExported: funcMatch[1][0] === funcMatch[1][0].toUpperCase(),
          line: i + 1,
          endLine: this.findGoBlockEnd(lines, i),
        })
      }
    }
  }

  private getExportType(line: string): Export['type'] {
    if (line.includes('function')) return 'function'
    if (line.includes('class')) return 'class'
    if (line.includes('interface')) return 'interface'
    if (line.includes('type ')) return 'type'
    return 'variable'
  }

  private parseParameters(paramsStr: string): Parameter[] {
    if (!paramsStr.trim()) return []
    
    return paramsStr.split(',').map(param => {
      const trimmed = param.trim()
      const optional = trimmed.includes('?')
      const [name, type] = trimmed.replace('?', '').split(':').map(s => s.trim())
      
      return {
        name: name || trimmed,
        type: type,
        isOptional: optional,
      }
    })
  }

  private parsePythonParameters(paramsStr: string): Parameter[] {
    if (!paramsStr.trim()) return []
    
    return paramsStr.split(',').map(param => {
      const trimmed = param.trim()
      const [name, type] = trimmed.split(':').map(s => s.trim())
      const isOptional = trimmed.includes('=')
      
      return {
        name: name?.split('=')[0].trim() || trimmed,
        type: type?.split('=')[0].trim(),
        isOptional,
      }
    })
  }

  private parseGoParameters(paramsStr: string): Parameter[] {
    if (!paramsStr.trim()) return []
    
    return paramsStr.split(',').map(param => {
      const trimmed = param.trim()
      const parts = trimmed.split(/\s+/)
      const name = parts[0]
      const type = parts.slice(1).join(' ')
      
      return { name, type, isOptional: false }
    })
  }

  private findBlockEnd(lines: string[], startIndex: number): number {
    let braceCount = 0
    let foundStart = false
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i]
      
      for (const char of line) {
        if (char === '{') {
          braceCount++
          foundStart = true
        } else if (char === '}') {
          braceCount--
          if (foundStart && braceCount === 0) {
            return i + 1
          }
        }
      }
    }
    
    return lines.length
  }

  private findPythonBlockEnd(lines: string[], startIndex: number): number {
    const baseIndent = lines[startIndex].search(/\S/)
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const currentIndent = lines[i].search(/\S/)
      if (currentIndent <= baseIndent && lines[i].trim()) {
        return i
      }
    }
    
    return lines.length
  }

  private findGoBlockEnd(lines: string[], startIndex: number): number {
    let braceCount = 0
    
    for (let i = startIndex; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') braceCount++
        else if (char === '}') {
          braceCount--
          if (braceCount === 0) return i + 1
        }
      }
    }
    
    return lines.length
  }

  private parseClassBody(lines: string[], startIndex: number, classInfo: ClassInfo): void {
    const braceStart = lines[startIndex].indexOf('{')
    if (braceStart === -1) return
    
    let braceCount = 0
    let started = false
    
    for (let i = startIndex; i < lines.length && i < classInfo.endLine; i++) {
      const line = lines[i]
      
      for (const char of line) {
        if (char === '{') {
          braceCount++
          started = true
        } else if (char === '}') {
          braceCount--
        }
      }
      
      if (started && braceCount === 1) {
        const trimmed = line.trim()
        
        // Method declaration
        const methodMatch = trimmed.match(/(?:private\s+|public\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/)
        if (methodMatch && !trimmed.includes('class ') && !trimmed.includes('interface ')) {
          classInfo.methods.push({
            name: methodMatch[1],
            parameters: this.parseParameters(methodMatch[2]),
            returnType: methodMatch[3]?.trim(),
            isAsync: trimmed.includes('async'),
            isStatic: trimmed.includes('static '),
            visibility: trimmed.includes('private ') ? 'private' : 
                       trimmed.includes('protected ') ? 'protected' : 'public',
          })
        }
        
        // Property declaration
        const propMatch = trimmed.match(/(?:private\s+|public\s+|protected\s+)?(?:static\s+)?(\w+)\s*:\s*([^=;]+)/)
        if (propMatch) {
          classInfo.properties.push({
            name: propMatch[1],
            type: propMatch[2].trim(),
            visibility: trimmed.includes('private ') ? 'private' : 
                       trimmed.includes('protected ') ? 'protected' : 'public',
            isStatic: trimmed.includes('static '),
          })
        }
      }
    }
  }

  private buildDependencyGraph(): void {
    for (const [filePath, parsed] of this.index.files) {
      const deps = new Set<string>()
      
      for (const imp of parsed.imports) {
        if (imp.path.startsWith('.')) {
          const resolved = this.resolveImport(filePath, imp.path)
          if (resolved) {
            deps.add(resolved)
          }
        }
      }
      
      this.index.dependencyGraph.set(filePath, deps)
    }
    
    for (const [file, deps] of this.index.dependencyGraph) {
      for (const dep of deps) {
        if (!this.index.reverseDependencyGraph.has(dep)) {
          this.index.reverseDependencyGraph.set(dep, new Set())
        }
        this.index.reverseDependencyGraph.get(dep)!.add(file)
      }
    }
  }

  private buildExportMap(): void {
    for (const [filePath, parsed] of this.index.files) {
      for (const exp of parsed.exports) {
        this.index.exportMap.set(exp.name, { file: filePath, export: exp })
      }
    }
  }

  resolveImport(fromFile: string, importPath: string): string | null {
    const dir = path.dirname(fromFile)
    const resolved = path.resolve(dir, importPath)
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']
    
    for (const ext of extensions) {
      const fullPath = resolved.endsWith(ext) ? resolved : resolved + ext
      if (this.index.files.has(fullPath)) {
        return fullPath
      }
    }
    
    return null
  }

  getFile(filePath: string): ParsedFile | undefined {
    return this.index.files.get(filePath)
  }

  getDependencies(filePath: string): Set<string> | undefined {
    return this.index.dependencyGraph.get(filePath)
  }

  getDependents(filePath: string): Set<string> | undefined {
    return this.index.reverseDependencyGraph.get(filePath)
  }

  findExport(name: string): { file: string; export: Export } | undefined {
    return this.index.exportMap.get(name)
  }

  getFileByExport(name: string): string | undefined {
    const exp = this.index.exportMap.get(name)
    return exp?.file
  }

  getAffectedFiles(filePath: string): string[] {
    const affected = new Set<string>()
    const queue = [filePath]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      const dependents = this.index.reverseDependencyGraph.get(current)
      
      if (dependents) {
        for (const dep of dependents) {
          if (!affected.has(dep)) {
            affected.add(dep)
            queue.push(dep)
          }
        }
      }
    }
    
    return Array.from(affected)
  }

  getIndex(): CodebaseIndex {
    return this.index
  }

  getLastIndexed(): number {
    return this.index.lastIndexed
  }

  async getFileStructure(): Promise<{
    directories: Map<string, string[]>
    files: Map<string, { language: string; size: number }>
  }> {
    const directories = new Map<string, string[]>()
    const files = new Map<string, { language: string; size: number }>()
    
    for (const [filePath, parsed] of this.index.files) {
      const dir = path.dirname(filePath)
      const fileName = path.basename(filePath)
      
      if (!directories.has(dir)) {
        directories.set(dir, [])
      }
      directories.get(dir)!.push(fileName)
      
      files.set(filePath, {
        language: parsed.language,
        size: parsed.imports.length + parsed.exports.length + parsed.classes.length + parsed.functions.length,
      })
    }
    
    return { directories, files }
  }
}