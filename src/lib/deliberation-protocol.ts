import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { logger } from './logger'

export type AgentRole = 'architect' | 'developer' | 'reviewer' | 'qa' | 'coordinator' | 'supervisor'

export interface Agent {
  id: string
  name: string
  role: AgentRole
  capabilities: string[]
  status: 'available' | 'busy' | 'offline'
  currentTask?: string
}

export interface DeliberationMessage {
  id: string
  type: 'proposal' | 'critique' | 'revision' | 'vote' | 'decision' | 'question' | 'answer'
  content: string
  author: string
  authorRole: AgentRole
  timestamp: number
  parentId?: string
  metadata?: Record<string, unknown>
  votes?: Vote[]
}

export interface Vote {
  voter: string
  voterRole: AgentRole
  value: 'approve' | 'reject' | 'abstain'
  rationale?: string
}

export interface DeliberationSession {
  id: string
  topic: string
  status: 'active' | 'decided' | 'abandoned'
  participants: string[]
  messages: DeliberationMessage[]
  decisions: string[]
  createdAt: number
  decidedAt?: number
  metadata?: Record<string, unknown>
}

export interface DeliberationResult {
  sessionId: string
  decision: string
  rationale: string
  votes: Vote[]
  consensus: boolean
}

export class DeliberationProtocol {
  private sessions: Map<string, DeliberationSession> = new Map()
  private agents: Map<string, Agent> = new Map()
  private maxDiscussionRounds = 5
  private voteThreshold = 0.6

  constructor() {
    this.initializeAgents()
  }

  private initializeAgents(): void {
    const defaultAgents: Agent[] = [
      { id: 'architect', name: 'Architect', role: 'architect', capabilities: ['design', 'architecture', 'patterns'], status: 'available' },
      { id: 'developer', name: 'Developer', role: 'developer', capabilities: ['code', 'refactor', 'implement'], status: 'available' },
      { id: 'reviewer', name: 'Reviewer', role: 'reviewer', capabilities: ['review', 'quality', 'security'], status: 'available' },
      { id: 'qa', name: 'QA', role: 'qa', capabilities: ['test', 'verify', 'validate'], status: 'available' },
    ]

    for (const agent of defaultAgents) {
      this.agents.set(agent.id, agent)
    }
  }

  async createSession(
    topic: string,
    participants: string[],
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const sessionId = `delib-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    const session: DeliberationSession = {
      id: sessionId,
      topic,
      status: 'active',
      participants,
      messages: [],
      decisions: [],
      createdAt: Date.now(),
      metadata,
    }

    this.sessions.set(sessionId, session)

    eventBus.broadcast('deliberation.created', {
      sessionId,
      topic,
      participants,
      timestamp: Date.now(),
    })

    logger.info({ sessionId, topic, participants }, 'Deliberation session created')
    return sessionId
  }

  async addMessage(
    sessionId: string,
    type: DeliberationMessage['type'],
    content: string,
    author: string,
    authorRole: AgentRole,
    parentId?: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${session.status}`)
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    const message: DeliberationMessage = {
      id: messageId,
      type,
      content,
      author,
      authorRole,
      timestamp: Date.now(),
      parentId,
      metadata,
    }

    session.messages.push(message)

    eventBus.broadcast('deliberation.message', {
      sessionId,
      message,
      timestamp: Date.now(),
    })

    return messageId
  }

  async vote(
    sessionId: string,
    messageId: string,
    voter: string,
    voterRole: AgentRole,
    value: Vote['value'],
    rationale?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const message = session.messages.find(m => m.id === messageId)
    if (!message) {
      throw new Error(`Message not found: ${messageId}`)
    }

    const existingVote = message.votes?.find(v => v.voter === voter)
    if (existingVote) {
      throw new Error(`Already voted: ${voter}`)
    }

    const vote: Vote = { voter, voterRole, value, rationale }
    
    if (!message.votes) {
      message.votes = []
    }
    message.votes.push(vote)

    eventBus.broadcast('deliberation.vote', {
      sessionId,
      messageId,
      vote,
      timestamp: Date.now(),
    })

    await this.checkForDecision(sessionId)
  }

  private async checkForDecision(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'active') return

    const proposals = session.messages.filter(m => m.type === 'proposal')
    if (proposals.length === 0) return

    for (const proposal of proposals) {
      if (!proposal.votes || proposal.votes.length < session.participants.length * 0.5) {
        continue
      }

      const votes = proposal.votes
      const approves = votes.filter(v => v.value === 'approve').length
      const rejects = votes.filter(v => v.value === 'reject').length
      const total = votes.length

      if (approves / total >= this.voteThreshold) {
        await this.reachDecision(sessionId, proposal.content, `Approved with ${Math.round(approves / total * 100)}% support`, votes, true)
        return
      }

      if (rejects / total >= this.voteThreshold) {
        session.status = 'abandoned'
        eventBus.broadcast('deliberation.abandoned', {
          sessionId,
          reason: `Rejected with ${Math.round(rejects / total * 100)}% opposition`,
          timestamp: Date.now(),
        })
        return
      }
    }
  }

  private async reachDecision(
    sessionId: string,
    decision: string,
    rationale: string,
    votes: Vote[],
    consensus: boolean
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.status = 'decided'
    session.decisions.push(decision)
    session.decidedAt = Date.now()

    eventBus.broadcast('deliberation.decided', {
      sessionId,
      decision,
      rationale,
      consensus,
      timestamp: Date.now(),
    })

    logger.info({ sessionId, decision, consensus }, 'Deliberation reached decision')
  }

  async getSession(sessionId: string): Promise<DeliberationSession | undefined> {
    return this.sessions.get(sessionId)
  }

  async getActiveSessions(): Promise<DeliberationSession[]> {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active')
  }

  async proposeAlternative(
    sessionId: string,
    originalMessageId: string,
    content: string,
    author: string,
    authorRole: AgentRole
  ): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return this.addMessage(sessionId, 'revision', content, author, authorRole, originalMessageId, {
      basedOn: originalMessageId,
    })
  }

  async askQuestion(
    sessionId: string,
    content: string,
    author: string,
    authorRole: AgentRole,
    to?: string
  ): Promise<string> {
    return this.addMessage(sessionId, 'question', content, author, authorRole, undefined, { to })
  }

  async answerQuestion(
    sessionId: string,
    content: string,
    author: string,
    authorRole: AgentRole,
    parentId: string
  ): Promise<string> {
    return this.addMessage(sessionId, 'answer', content, author, authorRole, parentId)
  }

  async getVotesForMessage(sessionId: string, messageId: string): Promise<Vote[]> {
    const session = this.sessions.get(sessionId)
    if (!session) return []
    
    const message = session.messages.find(m => m.id === messageId)
    return message?.votes || []
  }

  async getDiscussionTree(sessionId: string): Promise<DeliberationMessage[]> {
    const session = this.sessions.get(sessionId)
    if (!session) return []
    
    const roots = session.messages.filter(m => !m.parentId)
    const tree: DeliberationMessage[] = [...roots]
    
    const addReplies = (parentId: string) => {
      const replies = session.messages.filter(m => m.parentId === parentId)
      for (const reply of replies) {
        tree.push(reply)
        addReplies(reply.id)
      }
    }
    
    for (const root of roots) {
      addReplies(root.id)
    }
    
    return tree
  }

  async closeSession(sessionId: string, decision: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.reachDecision(sessionId, decision, 'Manually closed', [], false)
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  getAgentsByRole(role: AgentRole): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.role === role)
  }

  updateAgentStatus(agentId: string, status: Agent['status']): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = status
    }
  }

  assignTaskToAgent(agentId: string, taskId: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = 'busy'
      agent.currentTask = taskId
    }
  }

  releaseAgent(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = 'available'
      agent.currentTask = undefined
    }
  }
}

export const deliberationProtocol = new DeliberationProtocol()