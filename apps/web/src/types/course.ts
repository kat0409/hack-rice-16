export type Course = {
  id: string
  code: string
  title: string
}

export type Goal = {
  id: string
  label: string
  description: string
  timeBudgetMinutes: number
}

export type SourceFile = {
  id: string
  name: string
  fileType: 'PDF' | 'DOCX' | 'TXT' | 'MD'
  status: 'UPLOADED' | 'PARSING' | 'CHUNKING' | 'EMBEDDING' | 'EXTRACTING' | 'RESOLVING' | 'READY' | 'FAILED'
  pageCount?: number
  dateAdded: string
  errorCode?: string
  errorMessage?: string
}
