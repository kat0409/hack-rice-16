import { useEffect, useState } from 'react'
import { api, type ApiError, type ArtifactDto, type ArtifactType } from '@/lib/api'

export function useArtifact<T>(stepId: string | undefined, type: ArtifactType) {
  const [artifact, setArtifact] = useState<(ArtifactDto & { content: T }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!stepId) return
    let cancelled = false
    setArtifact(null)
    setError(null)
    setLoading(true)
    api
      .generateArtifact(stepId, type)
      .then((a) => {
        if (!cancelled) setArtifact(a as ArtifactDto & { content: T })
      })
      .catch((err: ApiError) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [stepId, type])

  return { artifact, loading, error }
}
