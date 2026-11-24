import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Search, Sparkles, Volume2, Play, Square, 
  Check, Crown, Globe, Mic, Radio
} from 'lucide-react';
import { Voice } from '../types';
import { useAuth } from '../hooks/useAuth';
import { fetchWithAuth } from '../lib/authHelper';
import { 
  SUPPORTED_LANGUAGES, 
  getVoiceLanguageCodes, 
  getPrimaryLanguageBadge
} from '../services/voices';

interface VoiceSelectorModalProps {
  onUpgrade?: () => void;
  isOpen: boolean;
  onClose: () => void;
  voices: Voice[];
  selectedVoice: Voice | null;
  onSelectVoice: (voice: Voice) => void;
}

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  voices,
  selectedVoice,
  onSelectVoice,
  onUpgrade,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLang, setSelectedLang] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<'all' | 'elevenlabs' | 'gemini' | 'microsoft' | 'openai' | 'system'>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const { userData } = useAuth();
  
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio playback
  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPreviewingVoiceId(null);
  };

  // Play audio sample
  const handlePreview = async (voice: Voice, e: React.MouseEvent) => {
    e.stopPropagation();

    if (previewingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewingVoiceId(voice.id);

    const isPt = voice.lang?.startsWith('pt') || voice.primaryLang === 'pt' || getVoiceLanguageCodes(voice).includes('pt');
    const sampleText = isPt 
      ? "Olá! Esta é uma demonstração de voz natural de alta fidelidade com inteligência artificial para sua leitura e estudos."
      : "Hello! This is a preview of natural AI voice reading for your documents and study lists.";

    // 0. ElevenLabs Voice (Dgorla & Cloned Voices)
    if (voice.isElevenLabs || voice.provider === 'elevenlabs') {
      try {
        const response = await fetchWithAuth('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sampleText, voiceId: voice.id })
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          previewAudioRef.current = audio;
          audio.onended = () => setPreviewingVoiceId(null);
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn("ElevenLabs preview fallback:", err);
      }
    }

    // 1. Gemini Voice
    if (voice.isGemini) {
      try {
        const response = await fetchWithAuth('/api/gemini/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sampleText, voiceName: voice.id })
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          previewAudioRef.current = audio;
          audio.onended = () => setPreviewingVoiceId(null);
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn("Gemini preview failed, falling back:", err);
      }
    }

    // 2. Microsoft Antonio Voice
    if (voice.isMicrosoft || voice.id === 'ms-antonio-neural') {
      try {
        const response = await fetchWithAuth('/api/microsoft/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sampleText, voiceName: 'pt-BR-AntonioNeural' })
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          previewAudioRef.current = audio;
          audio.onended = () => setPreviewingVoiceId(null);
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn("Microsoft Antonio preview fallback:", err);
      }
    }

    // 3. OpenAI Voice
    if (voice.isOpenAI) {
      try {
        const response = await fetchWithAuth('/api/openai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sampleText, voiceName: voice.id }),
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          previewAudioRef.current = audio;
          audio.onended = () => setPreviewingVoiceId(null);
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn("OpenAI preview fallback:", err);
      }
    }

    // 4. Native Speech Fallback
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(sampleText);
      if (voice.nativeVoice) utterance.voice = voice.nativeVoice;
      utterance.lang = isPt ? 'pt-BR' : 'en-US';
      utterance.onend = () => setPreviewingVoiceId(null);
      utterance.onerror = () => setPreviewingVoiceId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setPreviewingVoiceId(null);
    }
  };

  const handleSelect = (voice: Voice) => {
    stopPreview();
    onSelectVoice(voice);
    onClose();
  };

  // Language count calculation across all voices
  const languageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: voices.length };
    SUPPORTED_LANGUAGES.forEach(lang => {
      if (lang.code !== 'all') {
        counts[lang.code] = 0;
      }
    });

    voices.forEach(v => {
      const codes = getVoiceLanguageCodes(v);
      codes.forEach(c => {
        if (counts[c] !== undefined) {
          counts[c] = (counts[c] || 0) + 1;
        } else {
          counts['other'] = (counts['other'] || 0) + 1;
        }
      });
    });

    return counts;
  }, [voices]);

  // Filter voices according to active filters
  const filteredVoices = useMemo(() => {
    return voices.filter(voice => {
      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const nameMatch = voice.name.toLowerCase().includes(term);
        const descMatch = (voice.description || '').toLowerCase().includes(term);
        const accentMatch = (voice.accent || '').toLowerCase().includes(term);
        const langMatch = (voice.lang || '').toLowerCase().includes(term);
        if (!nameMatch && !descMatch && !accentMatch && !langMatch) return false;
      }

      // Language filter
      if (selectedLang !== 'all') {
        const codes = getVoiceLanguageCodes(voice);
        if (selectedLang === 'other') {
          const core = ['pt', 'en', 'es', 'fr', 'de', 'it'];
          const hasOther = codes.some(c => !core.includes(c));
          if (!hasOther && voice.lang !== 'multilingual') return false;
        } else {
          if (!codes.includes(selectedLang)) return false;
        }
      }

      // Provider filter
      if (providerFilter === 'elevenlabs') {
        if (!voice.isElevenLabs && voice.provider !== 'elevenlabs') return false;
      } else if (providerFilter === 'gemini') {
        if (!voice.isGemini) return false;
      } else if (providerFilter === 'microsoft') {
        if (!voice.isMicrosoft && voice.id !== 'ms-antonio-neural') return false;
      } else if (providerFilter === 'openai') {
        if (!voice.isOpenAI) return false;
      } else if (providerFilter === 'system') {
        if (voice.isElevenLabs || voice.isGemini || voice.isMicrosoft || voice.isOpenAI) return false;
      }

      // Gender filter
      if (genderFilter !== 'all') {
        if (voice.gender !== genderFilter) return false;
      }

      return true;
    });
  }, [voices, searchTerm, selectedLang, providerFilter, genderFilter]);

  // Render voice card
  const renderVoiceCard = (voice: Voice) => {
    const isSelected = selectedVoice?.id === voice.id;
    const isPreviewing = previewingVoiceId === voice.id;
    const langBadge = getPrimaryLanguageBadge(voice);

    const isElevenLabs = voice.isElevenLabs || voice.provider === 'elevenlabs';
    const isDgorla = voice.id === 'QeklSZR6uyDJECk01m3i' || voice.name.toLowerCase().includes('dgorla');
    const isGemini = voice.isGemini || voice.provider === 'gemini';
    const isMicrosoft = voice.isMicrosoft || voice.id === 'ms-antonio-neural';
    const isOpenAI = voice.isOpenAI || voice.provider === 'openai';

    const cleanName = voice.name
      .replace(/OpenAI: |Google |Microsoft /g, '')
      .split(' - ')[0]
      .trim();

    return (
      <div
        key={voice.id}
        onClick={() => handleSelect(voice)}
        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 group relative ${
          isSelected
            ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/25 ring-2 ring-indigo-500/20 shadow-sm'
            : isDgorla
            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/15 hover:border-amber-500 shadow-xs'
            : 'border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/90 shadow-xs'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                isDgorla
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 ring-2 ring-amber-500/50'
                  : isElevenLabs
                  ? 'bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-200 ring-1 ring-orange-400/40'
                  : isMicrosoft
                  ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200 ring-1 ring-blue-400/40'
                  : isGemini
                  ? 'bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200 ring-1 ring-purple-400/40'
                  : isOpenAI
                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {isDgorla ? '👑' : isElevenLabs ? '🎙️' : isMicrosoft ? '🇧🇷' : isGemini ? '✨' : isOpenAI ? '🤖' : '💻'}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {cleanName}
                </h3>
                {isDgorla && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 font-bold shrink-0 ring-1 ring-amber-400/40">
                    Voz Padrão Dgorla
                  </span>
                )}
                {!isDgorla && isElevenLabs && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-900 dark:bg-orange-950/70 dark:text-orange-300 font-bold shrink-0">
                    {voice.isCustom ? 'Clonada ElevenLabs' : 'ElevenLabs AI'}
                  </span>
                )}
                {isMicrosoft && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-bold shrink-0">
                    Microsoft Antonio
                  </span>
                )}
                {isGemini && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 font-bold shrink-0">
                    Gemini AI
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex-wrap">
                <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <span>{langBadge.flag}</span>
                  <span>{langBadge.label}</span>
                </span>
                {voice.accent && (
                  <>
                    <span>•</span>
                    <span className="capitalize">{voice.accent}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {isSelected ? (
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Check size={14} />
            </div>
          ) : (
            <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium shrink-0 pt-0.5">
              Usar voz
            </span>
          )}
        </div>

        {voice.description && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
            {voice.description}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isDgorla ? (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300">
                ElevenLabs Clonada
              </span>
            ) : isElevenLabs ? (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border border-orange-300">
                ElevenLabs
              </span>
            ) : isMicrosoft ? (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200">
                Microsoft
              </span>
            ) : isGemini ? (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200">
                Google Gemini
              </span>
            ) : isOpenAI ? (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
                OpenAI
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200">
                Sistema
              </span>
            )}

            {voice.gender && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 capitalize">
                {voice.gender === 'male' ? 'Masc' : voice.gender === 'female' ? 'Fem' : 'Neutro'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => handlePreview(voice, e)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-2xs ${
              isPreviewing
                ? 'bg-purple-600 text-white animate-pulse'
                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
            }`}
          >
            {isPreviewing ? (
              <>
                <Square size={12} fill="currentColor" />
                <span>Parar</span>
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                <span>Ouvir</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/70 dark:bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    Galeria de Vozes Inteligentes
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300 font-bold flex items-center gap-1 border border-amber-300">
                      👑 Dgorla & ElevenLabs
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Voz padrão Dgorla e vozes clonadas ElevenLabs, Google Gemini, Antonio da Microsoft e OpenAI.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  stopPreview();
                  onClose();
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={19} />
              </button>
            </div>

            {/* Language & Provider Filters */}
            <div className="p-4 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar voz por nome, estilo ou idioma..."
                  className="w-full pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'elevenlabs', label: '👑 Dgorla / ElevenLabs' },
                    { id: 'gemini', label: '✨ Gemini' },
                    { id: 'microsoft', label: '🇧🇷 Antonio (MS)' },
                    { id: 'openai', label: '🤖 OpenAI' },
                    { id: 'system', label: '💻 Sistema' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProviderFilter(p.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      providerFilter === p.id
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voices Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredVoices.map(renderVoiceCard)}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-500">
              <span>{filteredVoices.length} vozes disponíveis</span>
              <button
                onClick={() => {
                  stopPreview();
                  onClose();
                }}
                className="px-5 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold hover:opacity-90 transition-opacity"
              >
                Concluir
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
