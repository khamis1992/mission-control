export interface AgentConfig {
  name: string
  description: string
  model: string
  prompt: string
  tools: {
    write: boolean
    edit: boolean
    bash: boolean
    webFetch: boolean
    grep: boolean
    glob: boolean
  }
  timeout: number
}

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  architect: {
    name: 'architect',
    description: 'Designs and plans software architecture',
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    prompt: `You are a software architect. Your role is to:
- Analyze requirements and design clean, scalable architectures
- Create technical specifications and diagrams
- Make decisions about technology stack, patterns, and best practices
- Consider scalability, security, and maintainability
- Output clear, actionable plans for developers`,
    tools: {
      write: false,
      edit: false,
      bash: false,
      webFetch: true,
      grep: true,
      glob: true
    },
    timeout: 180
  },
  developer: {
    name: 'developer',
    description: 'Implements code features',
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    prompt: `You are a full-stack developer. Your role is to:
- Write clean, working code following best practices
- Implement features according to specifications
- Write tests for your code
- Follow TDD when appropriate
- Ensure code is well-documented
- Use TypeScript, React, Next.js, Tailwind CSS, SQLite as needed`,
    tools: {
      write: true,
      edit: true,
      bash: true,
      webFetch: true,
      grep: true,
      glob: true
    },
    timeout: 300
  },
  reviewer: {
    name: 'reviewer',
    description: 'Reviews code for quality and issues',
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    prompt: `You are a code reviewer. Your role is to:
- Review code for security vulnerabilities
- Check for performance issues
- Ensure code follows best practices
- Verify tests are adequate
- Look for potential bugs and edge cases
- Suggest improvements
- Do NOT make changes, only review and comment`,
    tools: {
      write: false,
      edit: false,
      bash: true,
      webFetch: false,
      grep: true,
      glob: true
    },
    timeout: 120
  },
  tester: {
    name: 'tester',
    description: 'Writes tests and ensures quality',
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    prompt: `You are a QA engineer and test specialist. Your role is to:
- Write comprehensive unit tests
- Write integration tests
- Write E2E tests when appropriate
- Test edge cases and error conditions
- Ensure high code coverage
- Use Vitest, Playwright, or similar testing frameworks`,
    tools: {
      write: true,
      edit: true,
      bash: true,
      webFetch: false,
      grep: true,
      glob: true
    },
    timeout: 180
  },
  deployer: {
    name: 'deployer',
    description: 'Handles deployment and DevOps',
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    prompt: `You are a DevOps engineer. Your role is to:
- Deploy applications to production
- Set up CI/CD pipelines
- Configure hosting (Vercel, Railway, etc.)
- Handle environment variables and secrets
- Monitor deployments and rollback if needed
- Configure Docker and docker-compose`,
    tools: {
      write: true,
      edit: true,
      bash: true,
      webFetch: true,
      grep: true,
      glob: true
    },
    timeout: 180
  },
  planner: {
    name: 'planner',
    description: 'Analyzes and plans without making changes',
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    prompt: `You are a planning agent. Your role is to:
- Analyze codebases and understand existing structure
- Create implementation plans
- Break down complex tasks into subtasks
- Identify dependencies and blockers
- Do NOT write any code or make changes`,
    tools: {
      write: false,
      edit: false,
      bash: false,
      webFetch: true,
      grep: true,
      glob: true
    },
    timeout: 120
  }
}

export function getAgentConfig(role: string): AgentConfig {
  return AGENT_CONFIGS[role] || AGENT_CONFIGS.developer
}

export function getAllAgentRoles(): string[] {
  return Object.keys(AGENT_CONFIGS)
}

export const DEFAULT_MODEL = process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat'
export const DEFAULT_TIMEOUT = parseInt(process.env.OPENCODE_TIMEOUT || '300', 10)
export const DEFAULT_MAX_RETRIES = parseInt(process.env.OPENCODE_MAX_RETRIES || '3', 10)