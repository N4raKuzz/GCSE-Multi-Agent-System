
export type AgentRole = 'Librarian' | 'Solver' | 'Examiner';

export interface AgentStatus {
  role: AgentRole;
  status: 'idle' | 'working' | 'completed' | 'error';
  message: string;
}

export interface Step {
  title: string;
  content: string;
  agent: AgentRole;
}

export interface TextbookContent {
  text: string;
  sourceName: string;
}

export interface ImageData {
  base64: string;
  mimeType: string;
}

export interface Solution {
  finalAnswer: string;
  steps: Step[];
  curriculumCheck: string;
}
