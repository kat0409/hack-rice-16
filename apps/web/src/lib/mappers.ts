import type { EvidenceDto, GraphDto, StudySessionDto, StudyStepDto } from '@/lib/api'
import type { GraphEdge, GraphNode, GraphNodeType, RelationType } from '@/types/graph'
import type { Citation, StudyStep } from '@/types/study'

export function mapCitation(ev: EvidenceDto): Citation {
  return { chunkId: ev.chunk_id, documentId: ev.document_id, label: ev.label, excerpt: ev.excerpt }
}

export function mapGraph(dto: GraphDto): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = dto.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type as GraphNodeType,
    description: n.description,
    importance: n.importance,
    confidence: n.confidence,
    sourceCount: n.source_count,
    aliases: n.aliases ?? [],
  }))
  const known = new Set(nodes.map((n) => n.id))
  const edges: GraphEdge[] = dto.edges
    .filter((e) => known.has(e.source) && known.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationType: e.relation_type as RelationType,
      confidence: e.confidence,
      rationale: e.rationale ?? '',
      evidence: e.evidence.map(mapCitation),
    }))
  return { nodes, edges }
}

export function mapStep(dto: StudyStepDto): StudyStep {
  return {
    id: dto.id ?? `${dto.knowledge_entity_id}-${dto.position}`,
    position: dto.position,
    conceptId: dto.knowledge_entity_id,
    conceptName: dto.entity_name,
    allocatedMinutes: dto.allocated_minutes,
    activityType: dto.activity_type,
    reason: dto.reason,
    status: dto.status ?? 'TODO',
    citations: (dto.citations ?? []).map(mapCitation),
  }
}

/** The backend stores TODO/COMPLETE; the first TODO after the last COMPLETE is what the student is on. */
export function withActiveStep(steps: StudyStep[]): StudyStep[] {
  if (steps.some((s) => s.status === 'ACTIVE')) return steps
  const index = steps.findIndex((s) => s.status === 'TODO')
  if (index < 0) return steps
  return steps.map((s, i) => (i === index ? { ...s, status: 'ACTIVE' } : s))
}

export function mapSession(dto: StudySessionDto): StudyStep[] {
  return withActiveStep(dto.steps.map(mapStep))
}
