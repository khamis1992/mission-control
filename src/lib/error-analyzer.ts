import type { BuildError } from './build-executor'

export type ErrorType = 
  | 'syntax'
  | 'dependency'
  | 'runtime'
  | 'config'
  | 'file_missing'
  | 'type_error'
  | 'unknown'

export interface ErrorAnalysis {
  type: ErrorType
  affected_files: string[]
  suggested_fix: string
  confidence: number
  auto_fixable: boolean
  fix_prompt?: string
}

export function classifyError(error: BuildError): ErrorType {
  const message = error.message.toLowerCase()
  const code = error.code?.toLowerCase() || ''
  
  if (message.includes('syntax') || code.includes('syntax') || message.includes('unexpected token')) {
    return 'syntax'
  }
  
  if (message.includes("cannot find module") || 
      message.includes("module not found") ||
      message.includes("npm err") ||
      message.includes("pnpm err") ||
      message.includes("enoent") && message.includes("node_modules")) {
    return 'dependency'
  }
  
  if (message.includes("typeerror") || 
      message.includes("referenceerror") ||
      message.includes("cannot read") ||
      message.includes("undefined is not")) {
    return 'runtime'
  }
  
  if (message.includes(".env") ||
      message.includes("config") ||
      message.includes("missing") && message.includes("variable") ||
      message.includes("invalid config")) {
    return 'config'
  }
  
  if (message.includes("enoent") || 
      message.includes("file not found") ||
      message.includes("cannot find file")) {
    return 'file_missing'
  }
  
  if (message.includes("type") && (
      message.includes("is not assignable") ||
      message.includes("argument of type") ||
      message.includes("ts2322") ||
      message.includes("ts2740"))) {
    return 'type_error'
  }
  
  return 'unknown'
}

export async function analyzeBuildError(
  error: BuildError,
  context: { task?: { title?: string; description?: string }; workspaceId?: number }
): Promise<ErrorAnalysis> {
  const type = classifyError(error)
  const affectedFiles = extractAffectedFiles(error)
  
  const analysis: ErrorAnalysis = {
    type,
    affected_files: affectedFiles,
    suggested_fix: '',
    confidence: 0.5,
    auto_fixable: false
  }
  
  switch (type) {
    case 'syntax':
      analysis.suggested_fix = `Fix syntax error in ${error.file || 'file'} at line ${error.line || 'unknown'}`
      analysis.confidence = 0.9
      analysis.auto_fixable = true
      analysis.fix_prompt = `Fix the following syntax error in ${error.file}:
${error.message}
Line ${error.line}
Provide only the corrected code, no explanation.`
      break
      
    case 'dependency':
      analysis.suggested_fix = 'Install missing dependencies with pnpm install'
      analysis.confidence = 0.85
      analysis.auto_fixable = true
      analysis.fix_prompt = `The following dependencies are missing:
${error.message}
Run the appropriate install command or add the missing package to package.json.`
      break
      
    case 'type_error':
      analysis.suggested_fix = `Fix TypeScript type error in ${error.file || 'file'}`
      analysis.confidence = 0.8
      analysis.auto_fixable = true
      analysis.fix_prompt = `Fix the TypeScript type error:
${error.message}
In file: ${error.file}
Provide the corrected code with proper types.`
      break
      
    case 'config':
      analysis.suggested_fix = 'Check configuration files and environment variables'
      analysis.confidence = 0.7
      analysis.auto_fixable = false
      break
      
    case 'file_missing':
      analysis.suggested_fix = `Create missing file: ${affectedFiles[0] || 'unknown'}`
      analysis.confidence = 0.75
      analysis.auto_fixable = true
      analysis.fix_prompt = `Create the missing file that is referenced in:
${error.message}`
      break
      
    case 'runtime':
      analysis.suggested_fix = 'Add null checks or fix undefined reference'
      analysis.confidence = 0.6
      analysis.auto_fixable = true
      analysis.fix_prompt = `Fix the runtime error:
${error.message}
Add proper null checks or fix the undefined reference.`
      break
      
    default:
      analysis.suggested_fix = 'Review the error and fix manually'
      analysis.confidence = 0.3
      analysis.auto_fixable = false
  }
  
  return analysis
}

export function isAutoFixable(errorType: ErrorType): boolean {
  const autoFixableTypes: ErrorType[] = ['syntax', 'dependency', 'type_error', 'file_missing', 'runtime']
  return autoFixableTypes.includes(errorType)
}

export function generateFixPrompt(analysis: ErrorAnalysis, subtask: { title: string; description?: string }): string {
  if (!analysis.auto_fixable || !analysis.fix_prompt) {
    return ''
  }
  
  return `${analysis.fix_prompt}

Context: This is part of the task "${subtask.title}"
${subtask.description || ''}

Provide only the fixed code, no explanations.`
}

function extractAffectedFiles(error: BuildError): string[] {
  const files: string[] = []
  
  if (error.file) {
    files.push(error.file)
  }
  
  const fileMatches = error.message.match(/(?:file|in|at)\s+([^\s:]+\.[a-z]+)/gi)
  if (fileMatches) {
    for (const match of fileMatches) {
      const file = match.replace(/^(?:file|in|at)\s+/i, '')
      if (!files.includes(file)) {
        files.push(file)
      }
    }
  }
  
  return files
}