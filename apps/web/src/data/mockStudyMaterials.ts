export type Flashcard = {
  id: string
  front: string
  back: string
  source: string
}

export type PracticeQuestion = {
  id: string
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  source: string
}

export const mockFlashcards: Flashcard[] = [
  {
    id: 'fc-1',
    front: 'What is a process?',
    back: 'A program in execution, including its current activity and resources — its own address space, separate from other processes.',
    source: 'Lecture 1 · p. 3',
  },
  {
    id: 'fc-2',
    front: 'Name the five core process states.',
    back: 'New, ready, running, waiting, and terminated.',
    source: 'Lecture 1 · p. 7',
  },
  {
    id: 'fc-3',
    front: 'What does a Process Control Block (PCB) store?',
    back: 'The process state, program counter, and registers — enough to resume the process later.',
    source: 'Processes.md',
  },
  {
    id: 'fc-4',
    front: 'What happens during a context switch?',
    back: 'The state of the current process is saved (to its PCB) and the state of the next process is restored.',
    source: 'Lecture 1 · p. 12',
  },
  {
    id: 'fc-5',
    front: 'How does Round Robin scheduling work?',
    back: 'Each process gets a fixed time quantum in a circular queue — a preemptive policy.',
    source: 'Scheduling.pdf · p. 9',
  },
]

export const mockPracticeQuestions: PracticeQuestion[] = [
  {
    id: 'q-1',
    prompt: 'Which state is a process in while blocked on I/O?',
    options: ['Ready', 'Running', 'Waiting', 'Terminated'],
    correctIndex: 2,
    explanation: 'The waiting state occurs when a process is blocked on I/O or another event, per Processes.md.',
    source: 'Processes.md',
  },
  {
    id: 'q-2',
    prompt: 'What is saved to a PCB during a context switch?',
    options: [
      'Only the program counter',
      'The process state, program counter, and registers',
      'The entire address space contents',
      'Nothing — PCBs are read-only',
    ],
    correctIndex: 1,
    explanation: 'The PCB stores the process state, program counter, and registers so the process can resume exactly where it left off.',
    source: 'Processes.md',
  },
  {
    id: 'q-3',
    prompt: 'What distinguishes Round Robin from First-Come, First-Served?',
    options: [
      'Round Robin is non-preemptive',
      'FCFS uses a fixed time quantum',
      'Round Robin preempts on a fixed time quantum; FCFS runs to completion in arrival order',
      'They are functionally identical',
    ],
    correctIndex: 2,
    explanation: 'Round Robin assigns each process a fixed time quantum in a circular queue, while FCFS runs processes strictly in arrival order without preemption.',
    source: 'Scheduling.pdf · p. 9',
  },
]
