import { Voice } from '../types';

export interface LanguageGroup {
  id: string;
  code: string;
  label: string;
  flag: string;
  description: string;
}

export const SUPPORTED_LANGUAGES: LanguageGroup[] = [
  { id: 'all', code: 'all', label: 'Todos os Idiomas', flag: '🌍', description: 'Todas as vozes disponíveis' },
  { id: 'pt', code: 'pt', label: 'Português (Brasil)', flag: '🇧🇷', description: 'Português com Antonio e Gemini' },
  { id: 'en', code: 'en', label: 'Inglês', flag: '🇺🇸', description: 'English (US, UK)' },
  { id: 'es', code: 'es', label: 'Espanhol', flag: '🇪🇸', description: 'Español' },
  { id: 'fr', code: 'fr', label: 'Francês', flag: '🇫🇷', description: 'Français' },
  { id: 'de', code: 'de', label: 'Alemão', flag: '🇩🇪', description: 'Deutsch' },
  { id: 'it', code: 'it', label: 'Italiano', flag: '🇮🇹', description: 'Italiano' },
  { id: 'other', code: 'other', label: 'Outros / Multilíngue', flag: '🌐', description: 'Outros idiomas' },
];

// ==========================================
// PREMIER ELEVENLABS VOICES (Dgorla & Cloned Voices)
// ==========================================

// Official Dgorla Cloned Voice - DEFAULT SYSTEM VOICE
export const ELEVENLABS_DGORLA_VOICE: Voice = {
  id: 'QeklSZR6uyDJECk01m3i',
  name: 'Dgorla (Voz Oficial Clonada • Eleven V4)',
  lang: 'pt-BR',
  primaryLang: 'pt',
  verifiedLanguages: ['pt', 'en', 'es', 'fr', 'de', 'it'],
  isElevenLabs: true,
  provider: 'elevenlabs',
  model: 'eleven_v4',
  gender: 'male',
  accent: 'Brasileiro (Clonada Oficial • Eleven V4)',
  useCase: 'Voz Principal Padrão (Eleven V4)',
  description: 'Voz oficial de altíssima fidelidade e entonação natural de Dgorla sintetizada no modelo Eleven V4 da ElevenLabs.',
  category: 'Dgorla Padrão',
  isCustom: true,
  previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/59a2d86a8eac43be9e8adf3469f3fe50/voices/QeklSZR6uyDJECk01m3i/b160d8b4-8f1e-4b96-9cfc-f6dbf231b878.mp3',
};

export const CURATED_ELEVENLABS_VOICES: Voice[] = [
  ELEVENLABS_DGORLA_VOICE,
  {
    id: 'J7tdmgZJ7kaJ10AITysA',
    name: 'DGorla26 calm (Eleven V4)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es', 'fr'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    model: 'eleven_v4',
    gender: 'male',
    accent: 'Calmo e Reflexivo (Eleven V4)',
    useCase: 'Leituras Profundas e Livros',
    description: 'Voz suave, pausada e reflexiva de Dgorla para leitura confortável de artigos e livros com o modelo Eleven V4.',
    category: 'ElevenLabs Clonadas',
    isCustom: true,
  },
  {
    id: 'bOGrjco0rE8IWpfEMb9i',
    name: 'LocutaPtBr (Eleven V4)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    model: 'eleven_v4',
    gender: 'male',
    accent: 'Locução Brasileira (Eleven V4)',
    useCase: 'Notícias e Apresentações',
    description: 'Voz de locução fluente e firme em português brasileiro sintetizada no modelo Eleven V4.',
    category: 'ElevenLabs Clonadas',
    isCustom: true,
  },
  {
    id: 'xHUwLsLfyqiYOIVTzLRW',
    name: 'Marcos (Eleven V4 Didático)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    model: 'eleven_v4',
    gender: 'male',
    accent: 'Didático e Acolhedor',
    useCase: 'Estudos e Resumos',
    description: 'Voz didática, acolhedora e expressiva em português no modelo Eleven V4.',
    category: 'ElevenLabs AI',
  },
  {
    id: 'KHmfNHtEjHhLK9eER20w',
    name: 'Fernanda (Eleven V4 Formal)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    model: 'eleven_v4',
    gender: 'female',
    accent: 'Formal e Clara',
    useCase: 'Documentos e Relatórios',
    description: 'Voz feminina formal com articulação neutra de altíssima clareza no modelo Eleven V4.',
    category: 'ElevenLabs AI',
  },
  {
    id: 'Qp1m430mlIgemkUmziRo',
    name: 'Guilherme (ElevenLabs)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    gender: 'male',
    accent: 'Profissional',
    useCase: 'Artigos Longos',
    description: 'Voz masculina profissional em português.',
    category: 'ElevenLabs AI',
  },
  {
    id: 'QKUsXFIIRdkywa2654FN',
    name: 'Gorla mio (ElevenLabs)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    gender: 'male',
    accent: 'Personalizado',
    useCase: 'Uso Pessoal',
    description: 'Voz clonada personalizada de Dgorla.',
    category: 'ElevenLabs Clonadas',
    isCustom: true,
  },
  {
    id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian (ElevenLabs)',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['pt', 'en', 'es', 'fr', 'de'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    gender: 'male',
    accent: 'Grave e Resonante',
    useCase: 'Narração Imersiva',
    description: 'Voz profunda, reconfortante e clássica da ElevenLabs.',
    category: 'ElevenLabs AI',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah (ElevenLabs)',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['pt', 'en', 'es', 'fr'],
    isElevenLabs: true,
    provider: 'elevenlabs',
    gender: 'female',
    accent: 'Confiante e Madura',
    useCase: 'Podcasts e Audiobooks',
    description: 'Voz feminina madura, expressiva e confiante.',
    category: 'ElevenLabs AI',
  },
];

// Premier Microsoft Brazil Voice
export const MICROSOFT_ANTONIO_VOICE: Voice = {
  id: 'ms-antonio-neural',
  name: 'Antonio (Microsoft Natural Neural)',
  lang: 'pt-BR',
  primaryLang: 'pt',
  verifiedLanguages: ['pt'],
  isOpenAI: false,
  isMicrosoft: true,
  provider: 'microsoft',
  gender: 'male',
  accent: 'Brasileiro (Neural)',
  useCase: 'Narração de Documentos e Listas',
  description: 'Voz masculina brasileira de altíssima fidelidade e entonação natural da Microsoft.',
  category: 'Microsoft Neural',
};

// Curated Google Gemini TTS Voices
export const CURATED_GEMINI_VOICES: Voice[] = [
  {
    id: 'gemini-puck',
    name: 'Gemini Puck (Google AI)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es', 'fr', 'de', 'it'],
    isGemini: true,
    provider: 'gemini',
    gender: 'male',
    accent: 'Multilíngue Fluente',
    useCase: 'Leitura Rápida e Dinâmica',
    description: 'Voz expressiva, ágil e altamente natural alimentada pela tecnologia Gemini.',
    category: 'Google Gemini AI',
  },
  {
    id: 'gemini-kore',
    name: 'Gemini Kore (Google AI)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es', 'fr', 'de', 'it'],
    isGemini: true,
    provider: 'gemini',
    gender: 'female',
    accent: 'Multilíngue Suave',
    useCase: 'Estudos e Artigos Longos',
    description: 'Voz feminina clara, envolvente e suave para longas sessões de audição.',
    category: 'Google Gemini AI',
  },
  {
    id: 'gemini-charon',
    name: 'Gemini Charon (Google AI)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es', 'fr', 'de'],
    isGemini: true,
    provider: 'gemini',
    gender: 'male',
    accent: 'Grave e Profundo',
    useCase: 'Documentos Formais',
    description: 'Voz masculina encorpada e confiante com pronúncia impecável em português.',
    category: 'Google Gemini AI',
  },
  {
    id: 'gemini-aoede',
    name: 'Gemini Aoede (Google AI)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es', 'fr', 'it'],
    isGemini: true,
    provider: 'gemini',
    gender: 'female',
    accent: 'Melódica e Clara',
    useCase: 'Leitura Acolhedora',
    description: 'Tom acolhedor e dicção refinada para audiobooks e resumos.',
    category: 'Google Gemini AI',
  },
  {
    id: 'gemini-fenrir',
    name: 'Gemini Fenrir (Google AI)',
    lang: 'pt-BR',
    primaryLang: 'pt',
    verifiedLanguages: ['pt', 'en', 'es', 'de'],
    isGemini: true,
    provider: 'gemini',
    gender: 'male',
    accent: 'Firme e Objetivo',
    useCase: 'Tarefas e Notícias',
    description: 'Voz enérgica e direta, perfeita para listas de tarefas e avisos com alarme.',
    category: 'Google Gemini AI',
  }
];

export const CURATED_OPENAI_VOICES: Voice[] = [
  {
    id: 'alloy',
    name: 'Alloy',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['en', 'pt', 'es', 'fr', 'de', 'it'],
    isOpenAI: true,
    provider: 'openai',
    gender: 'neutral',
    accent: 'Neutral',
    useCase: 'Narration',
    description: 'Versatile and neutral, great for general reading.',
    category: 'OpenAI Natural AI',
  },
  {
    id: 'echo',
    name: 'Echo',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['en', 'pt', 'es', 'fr', 'de', 'it'],
    isOpenAI: true,
    provider: 'openai',
    gender: 'male',
    accent: 'Warm',
    useCase: 'Storytelling',
    description: 'A warm, rounded male voice.',
    category: 'OpenAI Natural AI',
  },
  {
    id: 'fable',
    name: 'Fable',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['en', 'pt', 'es', 'fr', 'de'],
    isOpenAI: true,
    provider: 'openai',
    gender: 'male',
    accent: 'British',
    useCase: 'Authoritative',
    description: 'An authoritative British male voice.',
    category: 'OpenAI Natural AI',
  },
  {
    id: 'onyx',
    name: 'Onyx',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['en', 'pt', 'es', 'fr', 'de'],
    isOpenAI: true,
    provider: 'openai',
    gender: 'male',
    accent: 'Deep',
    useCase: 'Authoritative',
    description: 'A deep, authoritative male voice.',
    category: 'OpenAI Natural AI',
  },
  {
    id: 'nova',
    name: 'Nova',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['en', 'pt', 'es', 'fr', 'de', 'it'],
    isOpenAI: true,
    provider: 'openai',
    gender: 'female',
    accent: 'Energetic',
    useCase: 'Conversational',
    description: 'An energetic and natural female voice.',
    category: 'OpenAI Natural AI',
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    lang: 'multilingual',
    primaryLang: 'en',
    verifiedLanguages: ['en', 'pt', 'es', 'fr', 'de', 'it'],
    isOpenAI: true,
    provider: 'openai',
    gender: 'female',
    accent: 'Clear',
    useCase: 'Explanatory',
    description: 'A clear, bright female voice.',
    category: 'OpenAI Natural AI',
  }
];

export const ALL_CURATED_VOICES: Voice[] = [
  ...CURATED_ELEVENLABS_VOICES,
  MICROSOFT_ANTONIO_VOICE,
  ...CURATED_GEMINI_VOICES,
  ...CURATED_OPENAI_VOICES
];

/**
 * Returns all language codes associated with a voice for filtering and search
 */
export const getVoiceLanguageCodes = (voice: Voice): string[] => {
  const langs = new Set<string>();

  const nameLower = (voice.name || '').toLowerCase();
  const accentLower = (voice.accent || '').toLowerCase();
  const primLang = (voice.primaryLang || '').toLowerCase();
  const langLower = (voice.lang || '').toLowerCase();

  // Explicit primary or accent indicators
  if (
    primLang === 'pt' || 
    langLower.startsWith('pt') || 
    accentLower.includes('brazil') || 
    accentLower.includes('portug') ||
    nameLower.includes('dgorla') ||
    nameLower.includes('locuta') ||
    nameLower.includes('antonio') ||
    nameLower.includes('marcos') ||
    nameLower.includes('fernanda') ||
    nameLower.includes('guilherme')
  ) {
    langs.add('pt');
  }

  if (
    primLang === 'en' || 
    langLower.startsWith('en') || 
    accentLower.includes('american') || 
    accentLower.includes('british') || 
    accentLower.includes('australian') ||
    accentLower.includes('english')
  ) {
    langs.add('en');
  }

  if (primLang === 'es' || langLower.startsWith('es') || accentLower.includes('spanish')) {
    langs.add('es');
  }
  if (primLang === 'fr' || langLower.startsWith('fr') || accentLower.includes('french')) {
    langs.add('fr');
  }
  if (primLang === 'de' || langLower.startsWith('de') || accentLower.includes('german')) {
    langs.add('de');
  }
  if (primLang === 'it' || langLower.startsWith('it') || accentLower.includes('italian')) {
    langs.add('it');
  }

  // Gemini, OpenAI, and ElevenLabs voices are multilingual and work flawlessly with core languages
  if (voice.isOpenAI || voice.isGemini || voice.isElevenLabs) {
    langs.add('en');
    langs.add('pt');
    langs.add('es');
    langs.add('fr');
    langs.add('de');
    langs.add('it');
  }

  // Fallback
  if (langs.size === 0) {
    const raw = langLower.split('-')[0];
    langs.add(raw || 'pt');
  }

  return Array.from(langs);
};

export const getPrimaryLanguageBadge = (voice: Voice): { code: string; label: string; flag: string } => {
  const codes = getVoiceLanguageCodes(voice);
  const nameLower = (voice.name || '').toLowerCase();
  const accentLower = (voice.accent || '').toLowerCase();
  const primLang = (voice.primaryLang || '').toLowerCase();
  const langLower = (voice.lang || '').toLowerCase();

  if (voice.id === 'QeklSZR6uyDJECk01m3i' || nameLower.includes('dgorla')) {
    return { code: 'pt', label: 'Dgorla (Padrão)', flag: '🎙️' };
  }

  if (voice.isElevenLabs) {
    if (primLang === 'pt' || langLower.startsWith('pt') || (voice.accent || '').toLowerCase().includes('brasileir')) {
      return { code: 'pt', label: 'Português (ElevenLabs)', flag: '🇧🇷' };
    }
    return { code: 'other', label: 'ElevenLabs AI', flag: '🎙️' };
  }

  if (
    primLang === 'pt' || 
    accentLower.includes('brazil') || 
    nameLower.includes('antonio') ||
    voice.id === 'ms-antonio-neural'
  ) {
    return { code: 'pt', label: 'Português (Brasil)', flag: '🇧🇷' };
  }

  if (voice.isGemini) {
    return { code: 'pt', label: 'Português (Gemini)', flag: '🇧🇷' };
  }

  if (codes.includes('en') && (primLang === 'en' || !codes.includes('pt'))) {
    if (accentLower.includes('british')) {
      return { code: 'en', label: 'Inglês (Britânico)', flag: '🇬🇧' };
    }
    return { code: 'en', label: 'Inglês (Americano)', flag: '🇺🇸' };
  }

  if (codes.includes('es')) return { code: 'es', label: 'Espanhol', flag: '🇪🇸' };
  if (codes.includes('fr')) return { code: 'fr', label: 'Francês', flag: '🇫🇷' };
  if (codes.includes('de')) return { code: 'de', label: 'Alemão', flag: '🇩🇪' };
  if (codes.includes('it')) return { code: 'it', label: 'Italiano', flag: '🇮🇹' };
  if (codes.includes('pt')) return { code: 'pt', label: 'Português', flag: '🇧🇷' };

  return { code: 'other', label: 'Multilíngue', flag: '🌍' };
};
