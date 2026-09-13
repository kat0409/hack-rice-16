import type { Course, Goal, SourceFile } from '@/types/course'
import type { StudyStep } from '@/types/study'

export const DEMO_COURSE_ID = 'cs-4348'

export const mockCourse: Course = {
  id: DEMO_COURSE_ID,
  code: 'CS 4348',
  title: 'Operating Systems',
}

export const mockGoal: Goal = {
  id: 'exam-1',
  label: 'Exam 1 Study Route',
  description:
    "I have an exam tomorrow covering Units 1–3. I want to focus on processes and CPU scheduling.",
  timeBudgetMinutes: 90,
}

export const mockSources: SourceFile[] = [
  { id: 'src-1', name: 'Lecture 1.pdf', fileType: 'PDF', status: 'READY', pageCount: 24, dateAdded: '2026-09-10' },
  { id: 'src-2', name: 'Processes.md', fileType: 'MD', status: 'READY', dateAdded: '2026-09-10' },
  { id: 'src-3', name: 'Scheduling.pdf', fileType: 'PDF', status: 'READY', pageCount: 18, dateAdded: '2026-09-11' },
]

export const mockRoute: StudyStep[] = [
  {
    id: 'process-fundamentals',
    position: 0,
    conceptId: 'concept-process-fundamentals',
    conceptName: 'Process Fundamentals',
    allocatedMinutes: 10,
    activityType: 'LEARN',
    reason: 'Foundational concept for everything else in this unit.',
    status: 'COMPLETE',
    citations: [
      {
        chunkId: 'c1',
        documentId: 'src-1',
        label: 'Lecture 1 · p. 3',
        excerpt: 'A process is a program in execution, including its current activity and resources.',
      },
      {
        chunkId: 'c2',
        documentId: 'src-2',
        label: 'Processes.md',
        excerpt: 'Each process has its own address space, separate from other processes.',
      },
    ],
  },
  {
    id: 'process-states',
    position: 1,
    conceptId: 'concept-process-states',
    conceptName: 'Process States',
    allocatedMinutes: 8,
    activityType: 'LEARN',
    reason: 'You need Process States before Context Switching.',
    status: 'ACTIVE',
    citations: [
      {
        chunkId: 'c3',
        documentId: 'src-1',
        label: 'Lecture 1 · p. 7',
        excerpt: 'Processes move between five core states: new, ready, running, waiting, and terminated.',
      },
      {
        chunkId: 'c4',
        documentId: 'src-2',
        label: 'Processes.md',
        excerpt: 'The waiting state occurs when a process is blocked on I/O or another event.',
      },
    ],
  },
  {
    id: 'pcb-review',
    position: 2,
    conceptId: 'concept-pcb',
    conceptName: 'PCB Review',
    allocatedMinutes: 6,
    activityType: 'REVIEW',
    reason: 'Added to reinforce a prerequisite gap before Context Switching.',
    status: 'TODO',
    isReinforcement: true,
    citations: [
      {
        chunkId: 'c5',
        documentId: 'src-2',
        label: 'Processes.md',
        excerpt: 'The process control block (PCB) stores the process state, program counter, and registers.',
      },
    ],
  },
  {
    id: 'context-switching',
    position: 3,
    conceptId: 'concept-context-switching',
    conceptName: 'Context Switching',
    allocatedMinutes: 14,
    activityType: 'LEARN',
    reason: 'Required before CPU Scheduling makes sense.',
    status: 'TODO',
    citations: [
      {
        chunkId: 'c6',
        documentId: 'src-1',
        label: 'Lecture 1 · p. 12',
        excerpt: 'A context switch saves the state of the current process and restores the next.',
      },
    ],
  },
  {
    id: 'cpu-scheduling',
    position: 4,
    conceptId: 'concept-cpu-scheduling',
    conceptName: 'CPU Scheduling',
    allocatedMinutes: 18,
    activityType: 'LEARN',
    reason: 'Central topic for Exam 1 — you flagged this as a weak area.',
    status: 'TODO',
    citations: [
      {
        chunkId: 'c7',
        documentId: 'src-3',
        label: 'Scheduling.pdf · p. 2',
        excerpt: 'Scheduling algorithms determine which ready process runs next on the CPU.',
      },
      {
        chunkId: 'c8',
        documentId: 'src-3',
        label: 'Scheduling.pdf · p. 5',
        excerpt: 'Preemptive scheduling allows a running process to be interrupted.',
      },
    ],
  },
  {
    id: 'round-robin',
    position: 5,
    conceptId: 'concept-round-robin',
    conceptName: 'Round Robin',
    allocatedMinutes: 12,
    activityType: 'PRACTICE',
    reason: 'A specific scheduling algorithm you asked to focus on.',
    status: 'TODO',
    citations: [
      {
        chunkId: 'c9',
        documentId: 'src-3',
        label: 'Scheduling.pdf · p. 9',
        excerpt: 'Round robin assigns each process a fixed time quantum in a circular queue.',
      },
    ],
  },
]
