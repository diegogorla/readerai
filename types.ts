export interface Highlight {
  id: string;
  text: string;
}

export interface Comment {
  id: string;
  highlightId: string;
  text: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface OpenDocument {
  id: string;
  title: string;
  filename: string;
  content: string;
  originalContent: string;
  contentType: 'html' | 'url';
  sourceUrl?: string;
  type?: 'file' | 'drive' | 'url' | 'direct_text';
  highlights: Highlight[];
  comments: Comment[];
  isMinimized: boolean;
  createdAt: number;
}

export type ExportFormat = 'pdf' | 'docx' | 'txt';

export interface Voice {
  id: string;
  name: string;
  lang: string;
  isOpenAI?: boolean;
  isGemini?: boolean;
  isMicrosoft?: boolean;
  isElevenLabs?: boolean; // legacy compatibility fallback
  provider?: 'gemini' | 'openai' | 'microsoft' | 'system' | 'elevenlabs';
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  category?: string;
  accent?: string;
  useCase?: string;
  previewUrl?: string;
  nativeVoice?: SpeechSynthesisVoice;
  primaryLang?: string;
  verifiedLanguages?: string[];
  isCustom?: boolean;
  age?: string;
  model?: string;
}

export interface TTSState {
  isSpeaking: boolean;
  isPaused: boolean;
  rate: number;
  voices: Voice[];
  selectedVoice: Voice | null;
}

export interface RecognitionState {
  isListening: boolean;
  transcript?: string;
}

export interface ListItem {
  id: string;
  title: string;
  category: string;
  notes?: string;
  completed: boolean;
  hasAlarm?: boolean;
  alarmTime?: string; // e.g. "2026-09-30T10:00"
  createdAt: number;
  updatedAt?: number;
}

export interface UserData {
  plan: 'free' | 'pro';
  planType?: 'monthly' | 'annual' | 'lifetime';
  email?: string;
  name?: string;
  photoURL?: string;
  createdAt?: string;
  upgradedAt?: string;
  categories?: string[];
  usage?: Record<string, number>;
  [key: string]: any;
}
