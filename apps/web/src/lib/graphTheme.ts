import {
  FlaskConical,
  Lightbulb,
  ListOrdered,
  Sigma,
  Target,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { GraphNodeType, RelationType } from '@/types/graph'

export type NodeTypeStyle = {
  label: string
  color: string
  soft: string
  Icon: LucideIcon
}

/** One "colored pencil" per node type, kept muted so the paper still reads first. */
export const NODE_TYPE_STYLE: Record<GraphNodeType, NodeTypeStyle> = {
  CONCEPT: { label: 'Concept', color: '#4056A1', soft: '#E5E9F5', Icon: Lightbulb },
  SKILL: { label: 'Skill', color: '#5B7A4A', soft: '#E9EFE1', Icon: Target },
  FORMULA: { label: 'Formula', color: '#B4562D', soft: '#F5E6DC', Icon: Sigma },
  PROCEDURE: { label: 'Procedure', color: '#A87C1D', soft: '#F3E9D3', Icon: Workflow },
  PROCEDURE_STEP: { label: 'Step', color: '#C49A3C', soft: '#F7F0DF', Icon: ListOrdered },
  EXAMPLE: { label: 'Example', color: '#3E7C74', soft: '#DFEEEC', Icon: FlaskConical },
}

export type RelationStyle = {
  label: string
  color: string
  dash?: string
  arrow: boolean
  /** Hierarchy edges pull the target toward an earlier layout tier. */
  hierarchical: boolean
}

export const RELATION_STYLE: Record<RelationType, RelationStyle> = {
  REQUIRES: { label: 'requires', color: '#5D5B55', arrow: true, hierarchical: true },
  PART_OF: { label: 'part of', color: '#5D5B55', dash: '0.1 5', arrow: true, hierarchical: true },
  DERIVED_FROM: { label: 'derived from', color: '#5D5B55', dash: '9 4', arrow: true, hierarchical: true },
  APPLIED_IN: { label: 'applied in', color: '#A87C1D', dash: '7 5', arrow: true, hierarchical: true },
  EXAMPLE_OF: { label: 'example of', color: '#3E7C74', dash: '2 5', arrow: true, hierarchical: true },
  CONTRASTS_WITH: { label: 'contrasts with', color: '#B4562D', dash: '1 6', arrow: false, hierarchical: false },
  RELATED_TO: { label: 'related to', color: '#8B8880', dash: '1 6', arrow: false, hierarchical: false },
  HAS_STEP: { label: 'has step', color: '#A87C1D', dash: '0.1 4', arrow: true, hierarchical: true },
  NEXT: { label: 'then', color: '#A87C1D', arrow: true, hierarchical: true },
  PRODUCES: { label: 'produces', color: '#5B7A4A', dash: '5 4', arrow: true, hierarchical: false },
}
