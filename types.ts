
export enum SessionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface TranscriptionEntry {
  type: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AudioVisualizerProps {
  isActive: boolean;
  isModelTalking: boolean;
}
