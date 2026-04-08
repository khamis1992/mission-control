import type { Agent, Task } from './db'

/**
 * Role capability keywords for matching agents to tasks.
 * Each role has associated keywords that indicate task relevance.
 */
export const ROLE_CAPABILITIES: Record<string, string[]> = {
  planner: ['requirements', 'prd', 'roadmap', 'planning', 'documentation', 'spec', 'product', 'strategy', 'scope'],
  architect: ['design', 'architecture', 'database', 'schema', 'structure', 'system', 'api design', 'technical design'],
  backend: ['api', 'server', 'database', 'auth', 'integration', 'rest', 'graphql', 'endpoint', 'backend', 'service'],
  frontend: ['ui', 'component', 'page', 'styling', 'react', 'vue', 'angular', 'css', 'frontend', 'client'],
  qa: ['test', 'testing', 'e2e', 'integration', 'coverage', 'quality', 'verify', 'validation', 'qa'],
  devops: ['deploy', 'ci', 'cd', 'docker', 'kubernetes', 'infrastructure', 'pipeline', 'server', 'nginx', 'ssl'],
  reviewer: ['review', 'audit', 'quality', 'approval', 'check', 'validate', 'code review', 'security review'],
  recovery: ['fix', 'debug', 'recover', 'retry', 'heal', 'error', 'resolve', 'incident', 'troubleshoot']
}

/**
 * Score an agent's suitability for a task based on role matching.
 * Returns -1 for unavailable agents, otherwise a positive score.
 */
export function matchAgentToRole(agent: Agent, task: Task): number {
  // Offline or error agents cannot take work
  if (agent.status === 'offline' || agent.status === 'error') return -1

  const taskText = `${task.title} ${task.description || ''}`.toLowerCase()

  let score = 0

  // If task has a specific agent_role requirement
  if (task.agent_role) {
    const roleKeywords = ROLE_CAPABILITIES[task.agent_role] || []
    for (const keyword of roleKeywords) {
      if (taskText.includes(keyword)) score += 10
    }

    // Bonus for exact role match
    if (agent.role === task.agent_role) score += 30
  }

  // Idle agents get priority over busy ones
  if (agent.status === 'idle') score += 5

  // Check agent capabilities from config
  if (agent.config) {
    try {
      const cfg = JSON.parse(agent.config)
      const caps = Array.isArray(cfg.capabilities) ? cfg.capabilities : []
      for (const cap of caps) {
        if (typeof cap === 'string' && taskText.includes(cap.toLowerCase())) score += 15
      }
    } catch { /* ignore parse errors */ }
  }

  // Any non-offline agent gets at least 1 (can be a fallback)
  return Math.max(score, 1)
}

/**
 * Find the best agent for a specific role from a pool of candidates.
 * Returns null if no suitable agent is found.
 */
export function findBestAgentForRole(
  agents: Agent[],
  role: Task['agent_role'],
  taskText: string
): Agent | null {
  const candidates = agents
    .filter(a => a.status !== 'offline' && a.status !== 'error')
    .map(agent => ({
      agent,
      score: matchAgentToRole(agent, { agent_role: role } as Task)
    }))
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.agent || null
}

/**
 * Get all capability keywords for a given role.
 * Useful for building task descriptions or validation.
 */
export function getRoleKeywords(role: string): string[] {
  return ROLE_CAPABILITIES[role] || []
}
