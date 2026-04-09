/**
 * Task-Memory Link Types and Utilities
 * 
 * Links tasks to memory files/documents for context tracking and knowledge management.
 */

/**
 * Valid link contexts for task-memory relationships
 */
export enum LinkContext {
  /** Task was created from this memory/document */
  created_from = 'created_from',
  /** Memory is referenced in this task */
  referenced_in = 'referenced_in',
  /** Memory provides context for task execution */
  context_file = 'context_file',
  /** Memory contains task results/output */
  result_file = 'result_file',
  /** Agent learned from this memory during task */
  learned_from = 'learned_from',
}

/**
 * Link context values for runtime validation
 */
export const LINK_CONTEXT_VALUES: readonly string[] = Object.values(LinkContext)

/**
 * Task-memory link interface
 */
export interface TaskMemoryLink {
  /** Unique identifier */
  id: number
  /** Foreign key to tasks table */
  task_id: number
  /** Path to memory file/document */
  memory_path: string
  /** Context type for the link (from LinkContext enum) */
  link_context: string
  /** Username of agent who created the link */
  created_by: string
  /** Unix timestamp of creation */
  created_at: number
  /** Optional metadata (JSON) */
  metadata?: Record<string, any>
}

/**
 * Input for creating a new task-memory link
 */
export interface CreateTaskMemoryLinkInput {
  task_id: number
  memory_path: string
  link_context: string
  created_by?: string
  metadata?: Record<string, any>
}

/**
 * Validates that a link context is a valid LinkContext value
 * 
 * @param context - The context string to validate
 * @returns True if valid, false otherwise
 */
export function validateLinkContext(context: string): boolean {
  return LINK_CONTEXT_VALUES.includes(context)
}

/**
 * Creates a validated task-memory link object
 * 
 * @param input - The input data for creating the link
 * @returns TaskMemoryLink object with defaults applied
 * @throws Error if validation fails
 */
export function createTaskMemoryLink(input: CreateTaskMemoryLinkInput): Omit<TaskMemoryLink, 'id'> {
  if (typeof input.task_id !== 'number' || input.task_id <= 0 || !Number.isInteger(input.task_id)) {
    throw new Error('task_id must be a positive integer')
  }

  if (typeof input.memory_path !== 'string' || !input.memory_path.trim()) {
    throw new Error('memory_path is required and must be a non-empty string')
  }

  if (typeof input.link_context !== 'string' || !input.link_context.trim()) {
    throw new Error('link_context is required and must be a non-empty string')
  }

  if (!validateLinkContext(input.link_context)) {
    throw new Error(
      `Invalid link_context: "${input.link_context}". Valid values: ${LINK_CONTEXT_VALUES.join(', ')}`
    )
  }

  const link: Omit<TaskMemoryLink, 'id'> = {
    task_id: input.task_id,
    memory_path: input.memory_path.trim(),
    link_context: input.link_context.trim(),
    created_by: input.created_by?.trim() || 'system',
    created_at: Math.floor(Date.now() / 1000),
  }

  if (input.metadata !== undefined) {
    if (typeof input.metadata !== 'object' || input.metadata === null) {
      throw new Error('metadata must be an object')
    }
    link.metadata = input.metadata
  }

  return link
}

/**
 * Type guard to check if an object is a valid TaskMemoryLink
 * 
 * @param obj - Object to check
 * @returns True if object matches TaskMemoryLink interface
 */
export function isTaskMemoryLink(obj: any): obj is TaskMemoryLink {
  if (typeof obj !== 'object' || obj === null) return false

  return (
    typeof obj.id === 'number' &&
    typeof obj.task_id === 'number' &&
    typeof obj.memory_path === 'string' &&
    typeof obj.link_context === 'string' &&
    typeof obj.created_by === 'string' &&
    typeof obj.created_at === 'number' &&
    (obj.metadata === undefined || typeof obj.metadata === 'object')
  )
}