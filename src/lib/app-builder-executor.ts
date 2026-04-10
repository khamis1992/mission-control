import { getDatabase } from './db'
import { analyzeGoal, generateScaffold, storeScaffold, getScaffoldByTaskId } from './project-scaffold'
import { trackGeneratedFiles } from './file-generator'
import { getAllFilesForTask } from './code-storage'
import { GitHubClient, getGitHubToken } from './github-client'
import { detectProjectType, installDependencies, runBuild, storeBuildRun, getBuildRuns } from './build-executor'
import { getDeployProvider, storeDeployment, getLatestDeployment } from './deploy-provider'
import { analyzeBuildError } from './error-analyzer'
import { addArtifact } from './artifact-manager'
import { eventBus } from './event-bus'

export type BuildPhase = 
  | 'analyzing'
  | 'scaffolding'
  | 'executing'
  | 'github_pushing'
  | 'building'
  | 'deploying'
  | 'completed'
  | 'failed'

export interface BuildContext {
  task: any
  workspaceId: number
  projectPath: string
}

export interface BuildResult {
  success: boolean
  phase: BuildPhase
  url?: string
  error?: string
}

export async function buildApplication(
  rootTask: any,
  context: BuildContext
): Promise<BuildResult> {
  const state: { phase: BuildPhase } = { phase: 'analyzing' }
  
  try {
    state.phase = 'analyzing'
    await saveCheckpoint(rootTask.id, state.phase)
    
    const analysis = analyzeGoal(rootTask.title + ' ' + (rootTask.description || ''))
    
    state.phase = 'scaffolding'
    await saveCheckpoint(rootTask.id, state.phase)
    
    const scaffoldFiles = generateScaffold(analysis)
    const scaffold = {
      task_id: rootTask.id,
      project_type: analysis.project_type,
      framework: analysis.framework,
      language: analysis.language,
      database: analysis.database,
      styling: analysis.styling,
      file_tree: JSON.stringify(scaffoldFiles),
      workspace_id: context.workspaceId
    }
    
    await storeScaffold(rootTask.id, scaffold)
    
    state.phase = 'executing'
    await saveCheckpoint(rootTask.id, state.phase)
    
    state.phase = 'github_pushing'
    await saveCheckpoint(rootTask.id, state.phase)
    
    const gitHubToken = getGitHubToken(rootTask)
    if (gitHubToken && rootTask.github_repo) {
      try {
        const files = await getAllFilesForTask(rootTask.id)
        const client = new GitHubClient(gitHubToken)
        
        await client.pushFiles(
          rootTask.github_repo,
          files.map((f: { path: string; content: string }) => ({ path: f.path, content: f.content })),
          `feat: ${rootTask.title}`,
          rootTask.github_branch || 'main'
        )
      } catch (err) {
        console.error('GitHub push failed:', err)
      }
    }
    
    state.phase = 'building'
    await saveCheckpoint(rootTask.id, state.phase)
    
    const projectType = await detectProjectType(context.projectPath)
    
    const installResult = await installDependencies(context.projectPath, projectType)
    if (!installResult.success) {
      return { success: false, phase: 'building', error: 'Dependency installation failed' }
    }
    
    const buildResult = await runBuild(context.projectPath, projectType)
    await storeBuildRun(rootTask.id, null, buildResult)
    
    if (!buildResult.success && buildResult.errors.length > 0) {
      const errorAnalysis = await analyzeBuildError(buildResult.errors[0], { task: rootTask, workspaceId: context.workspaceId })
      
      if (!errorAnalysis.auto_fixable) {
        return { success: false, phase: 'building', error: buildResult.errors[0].message }
      }
    }
    
    state.phase = 'deploying'
    await saveCheckpoint(rootTask.id, state.phase)
    
    const vercelToken = process.env.VERCEL_TOKEN
    let deploymentUrl: string | undefined
    
    if (vercelToken && rootTask.github_repo) {
      try {
        const deployer = getDeployProvider('vercel')
        await deployer.connect({ token: vercelToken })
        
        const deployment = await deployer.deploy({
          repo_url: rootTask.github_repo,
          branch: rootTask.github_branch || 'main'
        })
        
        await storeDeployment(rootTask.id, 'vercel', deployment)
        
        if (deployment.url) {
          deploymentUrl = deployment.url
        }
      } catch (err) {
        console.error('Deployment failed:', err)
      }
    }
    
    state.phase = 'completed'
    await saveCheckpoint(rootTask.id, state.phase)
    
    if (deploymentUrl) {
      await addArtifact(rootTask.id, {
        type: 'config',
        title: 'Deployment',
        content: deploymentUrl,
        metadata: { provider: 'vercel' }
      })
    }
    
    return { 
      success: true, 
      phase: 'completed', 
      url: deploymentUrl 
    }
    
  } catch (error: unknown) {
    state.phase = 'failed'
    await saveCheckpoint(rootTask.id, state.phase)
    
    const err = error as Error
    return { 
      success: false, 
      phase: state.phase, 
      error: err.message 
    }
  }
}

async function saveCheckpoint(taskId: number, phase: BuildPhase): Promise<void> {
  const db = getDatabase()
  
  db.prepare(`
    UPDATE tasks SET 
      checkpoint_data = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify({ phase, timestamp: Date.now() }),
    Math.floor(Date.now() / 1000),
    taskId
  )
}

export async function getBuildStatus(taskId: number): Promise<{
  phase: BuildPhase
  scaffold: any
  buildRuns: any[]
  deployment: any
}> {
  const db = getDatabase()
  
  const task = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any
  const checkpoint = task?.checkpoint_data ? JSON.parse(task.checkpoint_data) : null
  
  const scaffold = getScaffoldByTaskId(taskId)
  const buildRuns = await getBuildRuns(taskId)
  const deployment = await getLatestDeployment(taskId)
  
  return {
    phase: checkpoint?.phase || 'analyzing',
    scaffold,
    buildRuns,
    deployment
  }
}