import { getDatabase } from './db'
import { request } from 'https'

export type DeployProviderName = 'vercel' | 'netlify' | 'manual'

export interface DeployConfig {
  token: string
  org?: string
  team?: string
}

export interface DeployProject {
  repo_url: string
  branch: string
  env_vars?: Record<string, string>
  build_command?: string
  output_dir?: string
}

export interface DeployResult {
  success: boolean
  deployment_id: string
  status: 'queued' | 'building' | 'ready' | 'error'
  url?: string
  error?: string
}

export interface DeploymentInfo {
  id: number
  task_id: number
  provider: DeployProviderName
  deployment_id: string | null
  repo_url: string | null
  branch: string
  status: string
  live_url: string | null
  created_at: number
  deployed_at: number | null
}

export interface DeployProvider {
  name: DeployProviderName
  connect(config: DeployConfig): Promise<void>
  deploy(project: DeployProject): Promise<DeployResult>
  getStatus(deploymentId: string): Promise<DeployResult>
  getLogs(deploymentId: string): Promise<string[]>
  getURL(deploymentId: string): Promise<string>
}

class VercelDeployer implements DeployProvider {
  name: DeployProviderName = 'vercel'
  private token: string = ''
  private teamId?: string
  
  async connect(config: DeployConfig): Promise<void> {
    this.token = config.token
    this.teamId = config.team
  }
  
  async deploy(project: DeployProject): Promise<DeployResult> {
    try {
      const response = await this.makeRequest('POST', '/v13/deployments', {
        name: this.extractRepoName(project.repo_url),
        gitSource: {
          type: 'github',
          repo: project.repo_url.replace('https://github.com/', ''),
          ref: project.branch
        },
        target: 'production'
      })
      
      return {
        success: true,
        deployment_id: response.id,
        status: response.readyState || 'queued',
        url: `https://${response.url}`
      }
    } catch (error: unknown) {
      const err = error as Error
      return {
        success: false,
        deployment_id: '',
        status: 'error',
        error: err.message
      }
    }
  }
  
  async getStatus(deploymentId: string): Promise<DeployResult> {
    const response = await this.makeRequest('GET', `/v13/deployments/${deploymentId}`)
    
    return {
      success: response.readyState === 'READY',
      deployment_id: response.id,
      status: this.mapStatus(response.readyState),
      url: `https://${response.url}`
    }
  }
  
  async getLogs(deploymentId: string): Promise<string[]> {
    const response = await this.makeRequest('GET', `/v2/deployments/${deploymentId}/events`)
    return response.events?.map((e: { text: string }) => e.text) || []
  }
  
  async getURL(deploymentId: string): Promise<string> {
    const status = await this.getStatus(deploymentId)
    return status.url || ''
  }
  
  private async makeRequest(method: string, path: string, body?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined
      
      const req = request({
        hostname: 'api.vercel.com',
        path,
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let responseData = ''
        res.on('data', chunk => responseData += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData)
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error?.message || 'Vercel API error'))
            } else {
              resolve(parsed)
            }
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        })
      })
      
      req.on('error', reject)
      
      if (data) {
        req.write(data)
      }
      req.end()
    })
  }
  
  private extractRepoName(url: string): string {
    const parts = url.split('/')
    return parts[parts.length - 1] || 'app'
  }
  
  private mapStatus(state: string): 'queued' | 'building' | 'ready' | 'error' {
    switch (state) {
      case 'QUEUED': return 'queued'
      case 'BUILDING': return 'building'
      case 'READY': return 'ready'
      case 'ERROR': return 'error'
      default: return 'queued'
    }
  }
}

class NetlifyDeployer implements DeployProvider {
  name: DeployProviderName = 'netlify'
  private token: string = ''
  
  async connect(config: DeployConfig): Promise<void> {
    this.token = config.token
  }
  
  async deploy(project: DeployProject): Promise<DeployResult> {
    return {
      success: false,
      deployment_id: '',
      status: 'error',
      error: 'Netlify deployment not yet implemented'
    }
  }
  
  async getStatus(deploymentId: string): Promise<DeployResult> {
    return { success: false, deployment_id: '', status: 'error' }
  }
  
  async getLogs(deploymentId: string): Promise<string[]> {
    return []
  }
  
  async getURL(deploymentId: string): Promise<string> {
    return ''
  }
}

export function getDeployProvider(name: DeployProviderName): DeployProvider {
  switch (name) {
    case 'vercel':
      return new VercelDeployer()
    case 'netlify':
      return new NetlifyDeployer()
    default:
      return new VercelDeployer()
  }
}

export async function storeDeployment(
  taskId: number,
  provider: DeployProviderName,
  result: DeployResult
): Promise<number> {
  const db = getDatabase()
  const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: number }
  
  const deployment = db.prepare(`
    INSERT INTO deployments (task_id, provider, deployment_id, status, live_url, created_at, deployed_at, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    provider,
    result.deployment_id,
    result.status,
    result.url || null,
    Math.floor(Date.now() / 1000),
    result.success ? Math.floor(Date.now() / 1000) : null,
    task?.workspace_id || 1
  )
  
  return deployment.lastInsertRowid as number
}

export async function getDeployments(taskId: number): Promise<DeploymentInfo[]> {
  const db = getDatabase()
  return db.prepare(`
    SELECT * FROM deployments WHERE task_id = ? ORDER BY created_at DESC
  `).all(taskId) as DeploymentInfo[]
}

export async function getLatestDeployment(taskId: number): Promise<DeploymentInfo | null> {
  const db = getDatabase()
  return db.prepare(`
    SELECT * FROM deployments WHERE task_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(taskId) as DeploymentInfo | null
}