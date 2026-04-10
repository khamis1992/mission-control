export interface ParsedStackFrame {
  file: string
  line: number
  column?: number
  function: string
  isNative: boolean
  isAsync: boolean
}

export interface StackTraceAnalysis {
  frames: ParsedStackFrame[]
  errorType?: string
  errorMessage?: string
  rootCause?: ParsedStackFrame
  callChain: string[]
  asyncFrames: ParsedStackFrame[]
  externalFrames: ParsedStackFrame[]
}

export interface SourceMapEntry {
  generated: { line: number; column: number }
  original: { line: number; column: number; source: string }
}

export interface SourceMap {
  sources: Map<string, SourceMapEntry[]>
  sourcesContent?: Map<string, string>
}

const STACK_PATTERNS = {
  v8: /^\s*at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?/,
  firefox: /^[^\s@]+@(.+?):(\d+):(\d+)/,
  webkit: /^(.+?)(?:\s\(|\s)(.+?):(\d+):(\d+)/,
  nodelike: /^\s*at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)/,
}

const ERROR_PATTERNS = [
  { pattern: /^(\w+Error):\s*(.+)/, type: 'named' },
  { pattern: /^(\w+Exception):\s*(.+)/, type: 'named' },
  { pattern: /^TypeError:\s*(.+)/, type: 'type' },
  { pattern: /^SyntaxError:\s*(.+)/, type: 'syntax' },
  { pattern: /^ReferenceError:\s*(.+)/, type: 'reference' },
  { pattern: /^RangeError:\s*(.+)/, type: 'range' },
]

export class StackTraceAnalyzer {
  private sourceMaps = new Map<string, SourceMap>()

  parseStackTrace(stack: string): ParsedStackFrame[] {
    const lines = stack.split('\n')
    const frames: ParsedStackFrame[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === '') continue
      
      const frame = this.parseLine(trimmed)
      if (frame) {
        frames.push(frame)
      }
    }
    
    return frames
  }

  private parseLine(line: string): ParsedStackFrame | null {
    for (const pattern of Object.values(STACK_PATTERNS)) {
      const match = line.match(pattern)
      if (match) {
        const [, func, file, lineStr, colStr] = match
        
        return {
          file: file || 'unknown',
          line: parseInt(lineStr, 10) || 0,
          column: parseInt(colStr, 10) || 0,
          function: func || '<anonymous>',
          isNative: file?.includes('native') || false,
          isAsync: func?.includes('async') || line.includes('async'),
        }
      }
    }
    
    return null
  }

  analyzeStackTrace(stack: string): StackTraceAnalysis {
    const frames = this.parseStackTrace(stack)
    
    const errorMatch = stack.split('\n')[0].match(ERROR_PATTERNS[0].pattern)
    let errorType: string | undefined
    let errorMessage: string | undefined
    
    if (errorMatch) {
      errorType = errorMatch[1]
      errorMessage = errorMatch[2]
    }

    const callChain = frames.map(f => `${f.function}@${f.file}:${f.line}`)
    const asyncFrames = frames.filter(f => f.isAsync)
    const externalFrames = frames.filter(
      f => f.isNative || (!f.file.includes('node_modules') && !f.file.includes('localhost'))
    )

    let rootCause: ParsedStackFrame | undefined
    for (const frame of frames) {
      if (!frame.isNative && frame.file) {
        rootCause = frame
        break
      }
    }

    return {
      frames,
      errorType,
      errorMessage,
      rootCause,
      callChain,
      asyncFrames,
      externalFrames,
    }
  }

  extractErrorInfo(stack: string): { type: string; message: string; stack: string } {
    const lines = stack.split('\n')
    const firstLine = lines[0] || ''
    
    for (const { pattern, type } of ERROR_PATTERNS) {
      const match = firstLine.match(pattern)
      if (match) {
        return {
          type: match[1] || type,
          message: match[2] || firstLine,
          stack: lines.slice(1).join('\n'),
        }
      }
    }

    return {
      type: 'Error',
      message: firstLine,
      stack: lines.slice(1).join('\n'),
    }
  }

  async loadSourceMap(mapPath: string, generatedFile: string): Promise<void> {
    try {
      const fs = await import('fs')
      const content = fs.readFileSync(mapPath, 'utf-8')
      const map = JSON.parse(content)
      
      const entries: SourceMapEntry[] = []
      const mappings = map.mappings?.split(';') || []
      let generatedLine = 0
      let generatedColumn = 0
      
      for (const line of mappings) {
        const segments = line.split(',')
        generatedColumn = 0
        
        for (const segment of segments) {
          if (!segment) continue
          
          const decoded = this.decodeVLQ(segment, generatedLine, generatedColumn)
          entries.push({
            generated: { line: decoded.generatedLine, column: decoded.generatedColumn },
            original: { 
              line: decoded.originalLine, 
              column: decoded.originalColumn, 
              source: map.sources[decoded.sourceIndex] || '' 
            },
          })
          
          generatedColumn = decoded.generatedColumn
        }
        generatedLine++
      }
      
      const sourceMap: SourceMap = {
        sources: new Map([[generatedFile, entries]]),
        sourcesContent: map.sourcesContent ? new Map(map.sourcesContent.map((c: string, i: number) => [map.sources[i], c])) : undefined,
      }
      
      this.sourceMaps.set(generatedFile, sourceMap)
    } catch (error) {
      console.error(`Failed to load source map: ${mapPath}`, error)
    }
  }

  private decodeVLQ(str: string, line: number, column: number): {
    sourceIndex: number
    originalLine: number
    originalColumn: number
    generatedLine: number
    generatedColumn: number
  } {
    const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    
    let result = 0
    let shift = 0
    let index = 0
    
    while (index < str.length) {
      let char = str[index++]
      if (char === '=') break
      const charIndex = BASE64.indexOf(char)
      if (charIndex === -1) continue
      
      result += (charIndex & 0x1F) << shift
      shift += 5
    }
    
    const value = result & 1 ? ~(result >> 1) : (result >> 1)
    
    return {
      sourceIndex: 0,
      originalLine: 0,
      originalColumn: 0,
      generatedLine: line,
      generatedColumn: column,
    }
  }

  getOriginalPosition(file: string, line: number, column: number): { file: string; line: number; column: number } | null {
    const map = this.sourceMaps.get(file)
    if (!map) return null
    
    const entries = map.sources.get(file)
    if (!entries) return null
    
    for (const entry of entries) {
      if (entry.generated.line === line && entry.generated.column === column) {
        return {
          file: entry.original.source,
          line: entry.original.line,
          column: entry.original.column,
        }
      }
    }
    
    return null
  }

  groupAsyncFrames(frames: ParsedStackFrame[]): Map<string, ParsedStackFrame[]> {
    const groups = new Map<string, ParsedStackFrame[]>()
    let currentGroup: ParsedStackFrame[] = []
    let currentAsyncFunc: string | null = null
    
    for (const frame of frames) {
      if (frame.isAsync) {
        if (!currentAsyncFunc) {
          currentAsyncFunc = frame.function
          currentGroup = [frame]
        } else {
          currentGroup.push(frame)
        }
      } else {
        if (currentGroup.length > 0) {
          groups.set(currentAsyncFunc || '<async>', currentGroup)
          currentGroup = []
          currentAsyncFunc = null
        }
      }
    }
    
    if (currentGroup.length > 0) {
      groups.set(currentAsyncFunc || '<async>', currentGroup)
    }
    
    return groups
  }

  formatStackTrace(analysis: StackTraceAnalysis, options?: { maxFrames?: number; colors?: boolean }): string {
    const maxFrames = options?.maxFrames || 20
    const frames = analysis.frames.slice(0, maxFrames)
    
    const lines: string[] = []
    
    if (analysis.errorType && analysis.errorMessage) {
      lines.push(`${analysis.errorType}: ${analysis.errorMessage}`)
    }
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const prefix = `  ${i + 1}.`
      
      if (options?.colors) {
        const funcColor = frame.isAsync ? '\x1b[33m' : '\x1b[36m'
        const reset = '\x1b[0m'
        lines.push(`${prefix} ${funcColor}${frame.function}${reset} (${frame.file}:${frame.line}:${frame.column || 0})`)
      } else {
        lines.push(`${prefix} ${frame.function} (${frame.file}:${frame.line}:${frame.column || 0})`)
      }
    }
    
    return lines.join('\n')
  }
}

export const stackTraceAnalyzer = new StackTraceAnalyzer()