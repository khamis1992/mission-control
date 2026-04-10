import { Octokit } from '@octokit/rest'

export interface GitHubConfig {
  org?: string
  repo_name: string
  private: boolean
  template_repo?: string
}

export interface RepoInfo {
  url: string
  full_name: string
  default_branch: string
}

export interface CommitInfo {
  sha: string
  html_url: string
  message: string
  author: string
  date: string
}

export interface PullRequest {
  number: number
  title: string
  url: string
  state: 'open' | 'closed' | 'merged'
  created_at: string
  author: string
}

export interface BranchInfo {
  name: string
  sha: string
  protected: boolean
}

export class GitHubClient {
  private octokit: Octokit
  private owner: string
  
  constructor(token: string, owner?: string) {
    this.octokit = new Octokit({ auth: token })
    this.owner = owner || ''
  }
  
  async initializeRepo(config: GitHubConfig): Promise<RepoInfo> {
    try {
      // Try to get existing repo
      const { data: existingRepo } = await this.octokit.repos.get({
        owner: this.owner,
        repo: config.repo_name
      })
      
      return {
        url: existingRepo.html_url,
        full_name: existingRepo.full_name,
        default_branch: existingRepo.default_branch
      }
    } catch (error: any) {
      if (error.status !== 404) throw error
      
      // Create new repo
      const createParams: any = {
        name: config.repo_name,
        private: config.private,
        auto_init: true
      }
      
      if (this.owner) {
        createParams.org = this.owner
      }
      
      if (config.template_repo) {
        const { data: newRepo } = await this.octokit.repos.createUsingTemplate({
          template_owner: this.owner,
          template_repo: config.template_repo,
          name: config.repo_name,
          private: config.private
        })
        
        return {
          url: newRepo.html_url,
          full_name: newRepo.full_name,
          default_branch: newRepo.default_branch || 'main'
        }
      }
      
      const { data: newRepo } = await this.octokit.repos.createForAuthenticatedUser(createParams)
      
      return {
        url: newRepo.html_url,
        full_name: newRepo.full_name,
        default_branch: newRepo.default_branch || 'main'
      }
    }
  }
  
  async pushFiles(
    repo: string,
    files: { path: string; content: string }[],
    message: string,
    branch: string = 'main'
  ): Promise<CommitInfo> {
    const [owner, repoName] = repo.includes('/') 
      ? repo.split('/') 
      : [this.owner, repo]
    
    if (!owner || !repoName) {
      throw new Error('Invalid repository format. Use "owner/repo" or set default owner.')
    }
    
    // Get the latest commit SHA
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`
    })
    
    const baseTreeSha = ref.object.sha
    
    // Get the tree for the latest commit
    const { data: commit } = await this.octokit.git.getCommit({
      owner,
      repo: repoName,
      commit_sha: baseTreeSha
    })
    
    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.git.createBlob({
          owner,
          repo: repoName,
          content: file.content,
          encoding: 'utf-8'
        })
        return { path: file.path, sha: blob.sha }
      })
    )
    
    // Create tree with new files
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo: repoName,
      base_tree: commit.tree.sha,
      tree: blobs.map(b => ({
        path: b.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: b.sha
      }))
    })
    
    // Create commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo: repoName,
      message,
      tree: tree.sha,
      parents: [baseTreeSha]
    })
    
    // Update ref
    await this.octokit.git.updateRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
      sha: newCommit.sha
    })
    
    return {
      sha: newCommit.sha,
      html_url: `https://github.com/${owner}/${repoName}/commit/${newCommit.sha}`,
      message,
      author: newCommit.author?.name || 'unknown',
      date: new Date().toISOString()
    }
  }
  
  async createBranch(
    repo: string,
    branchName: string,
    fromBranch: string = 'main'
  ): Promise<string> {
    const [owner, repoName] = repo.includes('/')
      ? repo.split('/')
      : [this.owner, repo]
    
    // Get the SHA of the source branch
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${fromBranch}`
    })
    
    // Create new branch
    await this.octokit.git.createRef({
      owner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha
    })
    
    return branchName
  }
  
  async createPR(
    repo: string,
    branch: string,
    title: string,
    body?: string
  ): Promise<{ number: number; url: string }> {
    const [owner, repoName] = repo.includes('/')
      ? repo.split('/')
      : [this.owner, repo]
    
    const { data: pr } = await this.octokit.pulls.create({
      owner,
      repo: repoName,
      title,
      head: branch,
      base: 'main',
      body: body || ''
    })
    
    return {
      number: pr.number,
      url: pr.html_url
    }
  }
  
  async getCommitHistory(
    repo: string,
    branch: string = 'main',
    limit: number = 10
  ): Promise<CommitInfo[]> {
    const [owner, repoName] = repo.includes('/')
      ? repo.split('/')
      : [this.owner, repo]
    
    const { data: commits } = await this.octokit.repos.listCommits({
      owner,
      repo: repoName,
      sha: branch,
      per_page: limit
    })
    
    return commits.map(c => ({
      sha: c.sha,
      html_url: c.html_url,
      message: c.commit.message,
      author: c.commit.author?.name || 'unknown',
      date: c.commit.author?.date || ''
    }))
  }
  
  async getPRs(
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<PullRequest[]> {
    const [owner, repoName] = repo.includes('/')
      ? repo.split('/')
      : [this.owner, repo]
    
    const { data: prs } = await this.octokit.pulls.list({
      owner,
      repo: repoName,
      state,
      per_page: 50
    })
    
    return prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.state as 'open' | 'closed' | 'merged',
      created_at: pr.created_at,
      author: pr.user?.login || 'unknown'
    }))
  }
  
  async getBranches(repo: string): Promise<BranchInfo[]> {
    const [owner, repoName] = repo.includes('/')
      ? repo.split('/')
      : [this.owner, repo]
    
    const { data: branches } = await this.octokit.repos.listBranches({
      owner,
      repo: repoName,
      per_page: 100
    })
    
    return branches.map(b => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected || false
    }))
  }
}

export function getGitHubToken(task?: any): string {
  return process.env.GITHUB_TOKEN || task?.metadata?.github_token || ''
}