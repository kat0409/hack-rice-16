const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1'

export type ApiError = Error & { code: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error(body?.error?.message ?? res.statusText), {
      code: body?.error?.code ?? 'UNKNOWN',
    })
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// Field names from the API are snake_case — the backend deliberately does not
// camelCase them (see graphite-rest/app/schemas.py), so convert at this boundary.
export type CourseDto = { id: string; name: string; description: string | null }

export type DocumentStatus =
  | 'UPLOADED'
  | 'PARSING'
  | 'CHUNKING'
  | 'EMBEDDING'
  | 'EXTRACTING'
  | 'RESOLVING'
  | 'READY'
  | 'FAILED'

export type DocumentDto = {
  id: string
  filename: string
  status: DocumentStatus
  error_code: string | null
  error_message: string | null
  page_count: number | null
  created_at: string
}

export type UploadResponse = {
  uploaded: { document: DocumentDto; job: { id: string; status: string } }[]
  rejected: { filename: string; code: string; message: string }[]
}

export type EvidenceDto = { chunk_id: string; document_id: string; label: string; excerpt: string }

export type GraphNodeDto = {
  id: string
  name: string
  type: string
  description: string
  importance: number
  confidence: number
  aliases: string[]
  source_count: number
}

export type GraphEdgeDto = {
  id: string
  source: string
  target: string
  relation_type: string
  confidence: number
  rationale: string | null
  evidence: EvidenceDto[]
}

export type GraphDto = { course_id: string; graph_version: string | null; nodes: GraphNodeDto[]; edges: GraphEdgeDto[] }

export type StudyStepDto = {
  id: string | null
  position: number
  knowledge_entity_id: string
  entity_name: string
  entity_type: string
  allocated_minutes: number
  activity_type: 'LEARN' | 'REVIEW' | 'PRACTICE' | 'CHECK'
  reason: string
  priority_score: number
  status: 'TODO' | 'ACTIVE' | 'COMPLETE' | 'SKIPPED'
  citations: EvidenceDto[]
}

export type StudySessionDto = {
  id: string
  course_id: string
  status: string
  goal_text: string
  available_minutes: number
  allocated_minutes: number
  explanation: string
  steps: StudyStepDto[]
  omitted_entities: { knowledge_entity_id: string; name: string; reason: string }[]
}

export type StudySessionSummaryDto = {
  id: string
  goal_text: string
  available_minutes: number
  created_at: string
}

export type ArtifactType = 'SUMMARY' | 'FLASHCARDS' | 'QUESTIONS' | 'NARRATION'

export type ArtifactDto = {
  id: string
  study_step_id: string
  artifact_type: ArtifactType
  content: Record<string, unknown>
  citations: EvidenceDto[]
  created_at: string
}

export type SummaryContent = {
  title: string
  learning_objective: string
  summary_markdown: string
  key_points: string[]
  common_confusions: string[]
}

export type FlashcardsContent = { cards: { front: string; back: string; citation_labels: string[] }[] }

export type QuestionsContent = {
  questions: {
    prompt: string
    options: string[]
    correct_index: number
    explanation: string
    citation_labels: string[]
  }[]
}

export const api = {
  listCourses: () => request<{ items: CourseDto[] }>('/courses'),

  getCourse: (id: string) => request<CourseDto>(`/courses/${id}`),

  createCourse: (name: string) => request<CourseDto>('/courses', json('POST', { name })),

  uploadDocuments: (courseId: string, files: File[], ocr: boolean) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return request<UploadResponse>(`/courses/${courseId}/documents?ocr=${ocr}`, {
      method: 'POST',
      body: form,
    })
  },

  listDocuments: (courseId: string) =>
    request<{ items: DocumentDto[] }>(`/courses/${courseId}/documents`),

  rerunExtraction: (documentId: string) =>
    request<{ id: string; status: string }>(`/documents/${documentId}/extract`, { method: 'POST' }),

  getGraph: (courseId: string) => request<GraphDto>(`/courses/${courseId}/graph`),

  listStudySessions: (courseId: string) =>
    request<{ items: StudySessionSummaryDto[] }>(`/courses/${courseId}/study-sessions`),

  createStudySession: (
    courseId: string,
    body: { goal_text: string; available_minutes: number; weakness_text: string | null },
  ) => request<StudySessionDto>(`/courses/${courseId}/study-sessions`, json('POST', body)),

  getStudySession: (sessionId: string) => request<StudySessionDto>(`/study-sessions/${sessionId}`),

  patchStudyStep: (stepId: string, status: StudyStepDto['status']) =>
    request<StudyStepDto>(`/study-steps/${stepId}`, json('PATCH', { status })),

  generateArtifact: (stepId: string, type: ArtifactType) =>
    request<ArtifactDto>(`/study-steps/${stepId}/artifacts?type=${type}`, { method: 'POST' }),

  createNarration: (artifactId: string) =>
    request<ArtifactDto>(`/study-artifacts/${artifactId}/narration`, { method: 'POST' }),

  narrationAudioUrl: (narrationId: string) => `${BASE}/narrations/${narrationId}/audio`,

  transcribeAudio: (courseId: string, audio: Blob, filename = 'voice.webm') => {
    const form = new FormData()
    form.append('audio', audio instanceof File ? audio : new File([audio], filename, { type: audio.type }))
    return request<{ text: string; language_code: string | null }>(
      `/courses/${courseId}/audio-transcriptions`,
      { method: 'POST', body: form },
    )
  },

  tutorTurn: (courseId: string, question: string, history: TutorHistoryTurn[]) =>
    request<TutorTurnDto>(`/courses/${courseId}/tutor/turns`, json('POST', { question, history })),

  tutorAudioUrl: (audioId: string) => `${BASE}/tutor-audio/${audioId}`,
}

export type TutorHistoryTurn = { role: 'user' | 'tutor'; text: string }

export type TutorTurnDto = {
  answer_text: string
  citations: EvidenceDto[]
  concepts: { id: string; name: string }[]
  audio_id: string | null
  audio_error: string | null
}
