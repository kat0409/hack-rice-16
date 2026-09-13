export type ActivityType = 'LEARN' | 'REVIEW' | 'PRACTICE' | 'CHECK'

export type StepStatus = 'TODO' | 'ACTIVE' | 'COMPLETE' | 'SKIPPED'

export type Citation = {
  chunkId: string
  documentId: string
  label: string
  excerpt: string
}

export type StudyStep = {
  id: string
  position: number
  conceptId: string
  conceptName: string
  allocatedMinutes: number
  activityType: ActivityType
  reason: string
  status: StepStatus
  citations: Citation[]
  /** True for AI-inserted reinforcement steps (e.g. a prerequisite review) not part of the original route. */
  isReinforcement?: boolean
}
