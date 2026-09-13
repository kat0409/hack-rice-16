import type { Citation } from './study'

export type GraphNodeType = 'CONCEPT' | 'SKILL' | 'FORMULA' | 'PROCESS' | 'EXAMPLE'

export type GraphNode = {
  id: string
  name: string
  type: GraphNodeType
  description: string
  importance: number
  confidence: number
  sourceCount: number
}

export type RelationType =
  | 'REQUIRES'
  | 'PART_OF'
  | 'EXAMPLE_OF'
  | 'CONTRASTS_WITH'
  | 'APPLIED_IN'
  | 'DERIVED_FROM'
  | 'RELATED_TO'

export type GraphEdge = {
  id: string
  source: string
  target: string
  relationType: RelationType
  confidence: number
  rationale: string
  evidence: Citation[]
}
