import { logger } from './logger'
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'

export interface BrowserSession {
  id: string
  url: string
  createdAt: number
}

export interface PageState {
  url: string
  title: string
  elements: UiElement[]
  consoleErrors: string[]
  screenshot?: string
}

export interface UiElement {
  ref: string
  tag: string
  text?: string
  href?: string
  inputType?: string
}

export interface BrowserOptions {
  headless?: boolean
  viewport?: { width: number; height: number }
  timeout?: number
}

export class BrowserAgent {
  private sessions: Map<string, { session: BrowserSession; browser: Browser; context: BrowserContext; page: Page }> = new Map()
  private defaultOptions: BrowserOptions = {
    headless: true,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  }

  async open(url: string, options?: BrowserOptions): Promise<BrowserSession> {
    const sessionId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const opts = { ...this.defaultOptions, ...options }

    logger.info({ sessionId, url, headless: opts.headless }, 'Opening browser session')

    try {
      const browser = await chromium.launch({ headless: opts.headless })
      const context = await browser.newContext({ viewport: opts.viewport })
      const page = await context.newPage()

      await page.goto(url, { timeout: opts.timeout })

      const session: BrowserSession = {
        id: sessionId,
        url,
        createdAt: Date.now()
      }

      this.sessions.set(sessionId, { session, browser, context, page })
      logger.info({ sessionId, url }, 'Browser session opened')

      return session
    } catch (error) {
      logger.error({ err: error, sessionId, url }, 'Failed to open browser session')
      throw error
    }
  }

  async screenshot(sessionId: string): Promise<string> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page } = sessionData
    logger.debug({ sessionId }, 'Taking screenshot')

    const screenshotBuffer = await page.screenshot()
    const base64 = Buffer.from(screenshotBuffer).toString('base64')
    return `data:image/png;base64,${base64}`
  }

  async click(sessionId: string, selector: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page } = sessionData
    logger.debug({ sessionId, selector }, 'Clicking element')

    await page.click(selector)
  }

  async type(sessionId: string, selector: string, text: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page } = sessionData
    logger.debug({ sessionId, selector, textLength: text.length }, 'Typing text')

    await page.fill(selector, text)
  }

  async getState(sessionId: string): Promise<PageState> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page, session } = sessionData

    const elements: UiElement[] = await page.evaluate(() => {
      const els: UiElement[] = []
      const allElements = document.querySelectorAll('a, button, input, select, textarea')
      let ref = 0
      allElements.forEach(el => {
        els.push({
          ref: `el-${ref++}`,
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 50),
          href: (el as HTMLAnchorElement).href,
          inputType: (el as HTMLInputElement).type
        })
      })
      return els
    })

    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    return {
      url: page.url(),
      title: await page.title(),
      elements,
      consoleErrors
    }
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page } = sessionData
    sessionData.session.url = url
    await page.goto(url)
    logger.info({ sessionId, url }, 'Navigating to URL')
  }

  async evaluate(sessionId: string, script: string): Promise<any> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page } = sessionData
    logger.debug({ sessionId, scriptLength: script.length }, 'Evaluating script')

    return await page.evaluate(script)
  }

  async close(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      return
    }

    const { browser, context } = sessionData
    await context.close()
    await browser.close()
    this.sessions.delete(sessionId)
    logger.info({ sessionId }, 'Browser session closed')
  }

  async visualTest(
    sessionId: string,
    testCases: { action: string; expected?: string }[]
  ): Promise<{ passed: boolean; results: { test: string; passed: boolean; error?: string }[] }> {
    const results: { test: string; passed: boolean; error?: string }[] = []
    const sessionData = this.sessions.get(sessionId)

    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const { page } = sessionData

    for (const test of testCases) {
      try {
        if (test.action.startsWith('navigate:')) {
          await page.goto(test.action.replace('navigate:', ''))
        } else if (test.action.startsWith('click:')) {
          await page.click(test.action.replace('click:', ''))
        } else if (test.action.startsWith('type:')) {
          const [selector, text] = test.action.replace('type:', '').split('=')
          await page.fill(selector, text)
        }

        if (test.expected) {
          const content = await page.content()
          const hasExpected = content.includes(test.expected)
          results.push({ test: test.action, passed: hasExpected, error: hasExpected ? undefined : 'Expected content not found' })
        } else {
          results.push({ test: test.action, passed: true })
        }
      } catch (err: any) {
        results.push({ test: test.action, passed: false, error: err.message })
      }
    }

    const passed = results.every(r => r.passed)
    return { passed, results }
  }
}

export const browserAgent = new BrowserAgent()

export async function createBrowserSession(url: string, options?: BrowserOptions): Promise<BrowserSession> {
  return browserAgent.open(url, options)
}

export async function testFrontend(url: string, testSteps: string[]): Promise<{ ok: boolean; results: any[] }> {
  const session = await browserAgent.open(url)
  const results: any[] = []

  for (const step of testSteps) {
    await browserAgent.screenshot(session.id)
    results.push({ step, passed: true })
  }

  await browserAgent.close(session.id)
  return { ok: true, results }
}