import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { TTSState, RecognitionState, Voice } from '../types';
import { auth } from '../lib/firebase';
import { 
  ALL_CURATED_VOICES, 
  ELEVENLABS_DGORLA_VOICE, 
  MICROSOFT_ANTONIO_VOICE, 
  CURATED_GEMINI_VOICES, 
  CURATED_OPENAI_VOICES 
} from '../services/voices';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export interface UtteranceWord {
  text: string;
  startChar: number;
  endChar: number;
  el: HTMLElement;
}

export interface UtteranceItem {
  id: number;
  text: string;
  sentenceElement: HTMLElement;
  wordElements: HTMLElement[];
  words: UtteranceWord[];
  blockElement: HTMLElement;
}

const SUPPORTED_COMMANDS: { [key: string]: string[] } = {
  play: ['leia em voz alta', 'read aloud', 'play', 'ler'],
  pause: ['pare', 'stop', 'pause'],
  restart: ['comece do início', 'start from beginning', 'reiniciar'],
  next: ['próximo', 'next'],
  previous: ['anterior', 'previous'],
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mapWordsToOffsets(sentenceText: string, wordEls: HTMLElement[]): UtteranceWord[] {
  let searchPos = 0;
  const words: UtteranceWord[] = [];

  wordEls.forEach(el => {
    const text = (el.textContent || '').trim();
    if (!text) return;

    const idx = sentenceText.indexOf(text, searchPos);
    const startChar = idx !== -1 ? idx : searchPos;
    const endChar = startChar + text.length;
    searchPos = endChar;

    words.push({
      text,
      startChar,
      endChar,
      el,
    });
  });

  return words;
}

function wrapTextNodesInWords(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.parentElement?.classList.contains('tts-word')) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    textNodes.push(n as Text);
  }

  textNodes.forEach(textNode => {
    const val = textNode.nodeValue || '';
    if (!val.trim()) return;

    const frag = document.createDocumentFragment();
    const tokens = val.split(/(\s+)/);
    tokens.forEach(tok => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) {
        frag.appendChild(document.createTextNode(tok));
      } else {
        const span = document.createElement('span');
        span.className = 'tts-word';
        span.textContent = tok;
        frag.appendChild(span);
      }
    });

    textNode.replaceWith(frag);
  });
}

export const useSpeech = (contentRef: RefObject<HTMLDivElement | null>, fileContent?: string) => {
  const [ttsState, setTtsState] = useState<TTSState>(() => {
    let initialVoice = ELEVENLABS_DGORLA_VOICE;
    try {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('readerai_selected_voice') : null;
      if (savedId) {
        const found = ALL_CURATED_VOICES.find(v => v.id === savedId);
        if (found) initialVoice = found;
      }
    } catch {}

    return {
      isSpeaking: false,
      isPaused: false,
      rate: 1,
      voices: ALL_CURATED_VOICES,
      selectedVoice: initialVoice,
    };
  });
  const [recognitionState, setRecognitionState] = useState<RecognitionState>({
    isListening: false,
    transcript: '',
  });
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);

  const utteranceQueueRef = useRef<UtteranceItem[]>([]);
  const currentUtteranceIndexRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const resumePlaybackRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentHighlightedWordRef = useRef<HTMLElement | null>(null);
  const audioRafRef = useRef<number | null>(null);

  // Auto-scroll control refs
  const userScrolledRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stop auto-scroll when user moves the scrollbar or scrolls with touch/wheel
  useEffect(() => {
    const handleUserScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      if (!userScrolledRef.current) {
        userScrolledRef.current = true;
        setIsAutoScrollPaused(true);
      }
    };

    window.addEventListener('wheel', handleUserScroll, { capture: true, passive: true });
    window.addEventListener('touchmove', handleUserScroll, { capture: true, passive: true });
    window.addEventListener('scroll', handleUserScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener('wheel', handleUserScroll, { capture: true });
      window.removeEventListener('touchmove', handleUserScroll, { capture: true });
      window.removeEventListener('scroll', handleUserScroll, { capture: true });
    };
  }, []);

  const removeHighlights = useCallback(() => {
    if (contentRef.current) {
      const activeElements = contentRef.current.querySelectorAll('.tts-active-sentence, .tts-current-word');
      activeElements.forEach(el => el.classList.remove('tts-active-sentence', 'tts-current-word'));
    }
    if (currentHighlightedWordRef.current) {
      currentHighlightedWordRef.current.classList.remove('tts-current-word');
      currentHighlightedWordRef.current = null;
    }
    if (audioRafRef.current) {
      cancelAnimationFrame(audioRafRef.current);
      audioRafRef.current = null;
    }
  }, [contentRef]);

  const cleanupSpeech = useCallback(() => {
    if (audioRafRef.current) {
      cancelAnimationFrame(audioRafRef.current);
      audioRafRef.current = null;
    }
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current.onboundary = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    removeHighlights();
  }, [removeHighlights]);

  // Smooth auto-scroll keeping word/sentence comfortably centered
  const scrollElementIntoViewIfNeeded = useCallback((element: HTMLElement, forceCenter = false) => {
    if (userScrolledRef.current) return;

    const rect = element.getBoundingClientRect();
    const vHeight = window.innerHeight || document.documentElement.clientHeight;

    // Check if element is drifting out of comfortable middle corridor
    const isOutOfZone = forceCenter || rect.top < 120 || rect.bottom > vHeight - 160;

    if (isOutOfZone) {
      isProgrammaticScrollRef.current = true;
      try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch (e) {
        console.warn("Scroll error:", e);
      }
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }
  }, []);

  const setWordHighlight = useCallback((wordEl: HTMLElement) => {
    if (currentHighlightedWordRef.current === wordEl) return;

    if (currentHighlightedWordRef.current) {
      currentHighlightedWordRef.current.classList.remove('tts-current-word');
    }

    wordEl.classList.add('tts-current-word');
    currentHighlightedWordRef.current = wordEl;

    if (!userScrolledRef.current) {
      scrollElementIntoViewIfNeeded(wordEl, false);
    }
  }, [scrollElementIntoViewIfNeeded]);

  const handleResumeAutoScroll = useCallback(() => {
    userScrolledRef.current = false;
    setIsAutoScrollPaused(false);

    const curUtterance = utteranceQueueRef.current[currentUtteranceIndexRef.current];
    const target = currentHighlightedWordRef.current || curUtterance?.sentenceElement;
    if (target) {
      isProgrammaticScrollRef.current = true;
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch (e) {}
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }
  }, []);

  // Helper to retrieve auth token (Firebase token or 2FA session token)
  const getAuthToken = useCallback(async () => {
    if (auth.currentUser) {
      try {
        return await auth.currentUser.getIdToken();
      } catch {}
    }
    return typeof window !== 'undefined' ? localStorage.getItem('readerai_session_token') || null : null;
  }, []);

  const getLocalVoices = useCallback(() => {
    if (!('speechSynthesis' in window)) return [];
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return [];

    const supportedLangs = ['en', 'pt-BR', 'es', 'fr', 'de', 'it'];
    const filteredVoices = voices.filter(v =>
      supportedLangs.some(lang => v.lang.startsWith(lang))
    );

    return filteredVoices.map(v => {
      const name = v.name.replace(/Google|Microsoft|Natural|Neural/g, '').trim();
      const isMale = ['daniel', 'antonio', 'guilherme', 'thiago', 'guy', 'christopher', 'eric', 'humberto', 'ricardo', 'marcos', 'felipe', 'alex', 'bruno', 'norton', 'vicente', 'paulo', 'rodrigo'].some(m => name.toLowerCase().includes(m));
      const isFemale = ['maria', 'francisca', 'heloisa', 'joana', 'zita', 'samantha', 'victoria', 'luciana', 'adriana', 'fernanda'].some(f => name.toLowerCase().includes(f));

      return {
        id: v.name,
        name: v.name,
        lang: v.lang,
        isOpenAI: false,
        isElevenLabs: false,
        provider: 'system',
        gender: isMale ? 'male' : isFemale ? 'female' : undefined,
        nativeVoice: v,
      } as Voice;
    });
  }, []);

  const fetchOpenAIVoices = useCallback(async () => {
    try {
      return [];
    } catch (error) {
      console.error("Failed to fetch OpenAI voices:", error);
      return [];
    }
  }, []);

  useEffect(() => {
    const updateVoices = async () => {
      // 1. Fetch dynamic ElevenLabs voices from backend
      let dynamicElevenLabs: Voice[] = [];
      try {
        const elRes = await fetch('/api/elevenlabs/voices');
        if (elRes.ok) {
          const elData = await elRes.json();
          if (Array.isArray(elData.voices) && elData.voices.length > 0) {
            dynamicElevenLabs = elData.voices;
          }
        }
      } catch (e) {
        console.warn("Could not fetch dynamic ElevenLabs voices:", e);
      }

      const localVoices = getLocalVoices();

      // Check if browser has native Microsoft Antonio
      const nativeAntonio = localVoices.find(v => v.name.toLowerCase().includes('antonio'));
      const curatedWithNative = ALL_CURATED_VOICES.map(v => {
        if (v.id === 'ms-antonio-neural' && nativeAntonio?.nativeVoice) {
          return { ...v, nativeVoice: nativeAntonio.nativeVoice };
        }
        return v;
      });

      // Merge dynamic ElevenLabs voices with curated list, ensuring Dgorla is always at top
      const baseCurated = [...curatedWithNative];
      dynamicElevenLabs.forEach(dev => {
        const existingIdx = baseCurated.findIndex(b => b.id === dev.id);
        if (existingIdx !== -1) {
          baseCurated[existingIdx] = { ...baseCurated[existingIdx], ...dev };
        } else {
          baseCurated.push(dev);
        }
      });

      // Always sort Dgorla first
      baseCurated.sort((a, b) => {
        const aIsDgorla = a.id === 'QeklSZR6uyDJECk01m3i' || a.name.toLowerCase().includes('dgorla');
        const bIsDgorla = b.id === 'QeklSZR6uyDJECk01m3i' || b.name.toLowerCase().includes('dgorla');
        if (aIsDgorla && !bIsDgorla) return -1;
        if (!aIsDgorla && bIsDgorla) return 1;
        return 0;
      });

      const allVoices = [...baseCurated, ...localVoices];

      if (allVoices.length === 0) return;

      const defaultVoice =
        allVoices.find(v => v.id === 'QeklSZR6uyDJECk01m3i') ||
        allVoices.find(v => v.name.toLowerCase().includes('dgorla')) ||
        allVoices.find(v => v.id === 'ms-antonio-neural') ||
        allVoices.find(v => v.primaryLang === 'pt') ||
        allVoices[0];

      setTtsState(prev => {
        const currentVoiceIds = prev.voices.map(v => v.id).join(',');
        const newVoiceIds = allVoices.map(v => v.id).join(',');

        if (currentVoiceIds === newVoiceIds && prev.voices.length > 0 && prev.selectedVoice) return prev;

        let newSelected = prev.selectedVoice;
        try {
          const savedId = localStorage.getItem('readerai_selected_voice');
          if (savedId) {
            const found = allVoices.find(v => v.id === savedId);
            if (found) newSelected = found;
          } else if (!newSelected || newSelected.id === 'ms-antonio-neural') {
            newSelected = defaultVoice || null;
          }
        } catch {
          if (!newSelected || newSelected.id === 'ms-antonio-neural') {
            newSelected = defaultVoice || null;
          }
        }

        return {
          ...prev,
          voices: allVoices,
          selectedVoice: newSelected,
        };
      });
    };

    if ('speechSynthesis' in window) {
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
      return () => {
        cleanupSpeech();
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    } else {
      updateVoices();
    }
  }, [getLocalVoices, cleanupSpeech]);

  // Synchronize words with audio playback via requestAnimationFrame
  const syncWordsWithAudio = useCallback((utterance: UtteranceItem, audio: HTMLAudioElement) => {
    if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);

    const words = utterance.words;
    if (words.length === 0) return;

    const totalChars = words.reduce((acc, w) => acc + Math.max(2, w.text.length) + (/[.,!?;:]$/.test(w.text) ? 2 : 0), 0);
    let accum = 0;
    const wordIntervals = words.map(w => {
      const weight = Math.max(2, w.text.length) + (/[.,!?;:]$/.test(w.text) ? 2 : 0);
      const start = accum;
      accum += weight;
      const end = accum;
      return { w, start, end, weight };
    });

    const checkFrame = () => {
      if (!audio || audio.paused || audio.ended) return;
      const duration = audio.duration;
      if (duration > 0) {
        const curTime = audio.currentTime;
        const progress = Math.min(1, Math.max(0, curTime / duration));
        const targetCharPos = progress * totalChars;

        let match = wordIntervals.find(t => targetCharPos >= t.start && targetCharPos < t.end);
        if (!match && wordIntervals.length > 0) {
          match = wordIntervals[progress >= 1 ? wordIntervals.length - 1 : 0];
        }

        if (match?.w.el) {
          setWordHighlight(match.w.el);
        }
      }
      audioRafRef.current = requestAnimationFrame(checkFrame);
    };

    audioRafRef.current = requestAnimationFrame(checkFrame);
  }, [setWordHighlight]);

  // Playback queue runner with sentence highlighting, word tracking, and smooth scrolling
  const playQueue = useCallback(async () => {
    if (currentUtteranceIndexRef.current >= utteranceQueueRef.current.length) {
      setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
      removeHighlights();
      return;
    }

    const currentUtterance = utteranceQueueRef.current[currentUtteranceIndexRef.current];
    const sentenceElement = currentUtterance.sentenceElement;
    const text = currentUtterance.text;
    const voice = ttsState.selectedVoice;

    if (!voice) return;

    if (!text.trim()) {
      currentUtteranceIndexRef.current++;
      playQueue();
      return;
    }

    removeHighlights();
    sentenceElement.classList.add('tts-active-sentence');

    // Auto-scroll to center sentence if user hasn't scrolled manually
    if (!userScrolledRef.current) {
      scrollElementIntoViewIfNeeded(sentenceElement, true);
    }

    // Native Web Speech API execution helper
    const playWithNativeSpeech = () => {
      if (!('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice.nativeVoice) {
        utterance.voice = voice.nativeVoice;
      } else {
        // Find best match in browser voices
        const browserVoices = window.speechSynthesis.getVoices();
        const bestVoice = browserVoices.find(v => v.lang.startsWith('pt')) || browserVoices[0];
        if (bestVoice) utterance.voice = bestVoice;
      }
      utterance.lang = voice.lang || 'pt-BR';
      utterance.rate = ttsState.rate;

      (window as any).currentUtterance = utterance;

      utterance.onboundary = (e: any) => {
        if (e.name === 'word') {
          const charIndex = e.charIndex;
          const words = currentUtterance.words;
          let match = words.find(w => charIndex >= w.startChar && charIndex < w.endChar);
          if (!match) {
            match = words.find(w => w.startChar >= charIndex);
          }
          if (!match && words.length > 0) {
            match = words[words.length - 1];
          }
          if (match?.el) {
            setWordHighlight(match.el);
          }
        }
      };

      utterance.onend = () => {
        removeHighlights();
        currentUtteranceIndexRef.current++;
        playQueue();
      };

      utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
        removeHighlights();
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.error("Speech synthesis error:", e.error);
        setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
    };

    // Play with ElevenLabs TTS (Dgorla and custom voices)
    if (voice.isElevenLabs || voice.provider === 'elevenlabs') {
      try {
        const token = await getAuthToken();
        const response = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            text,
            voiceId: voice.id,
            voiceName: voice.name
          }),
        });

        if (!response.ok) {
          console.warn("ElevenLabs TTS error, falling back to native:", response.status);
          playWithNativeSpeech();
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        audioRef.current.src = url;
        audioRef.current.playbackRate = ttsState.rate;

        audioRef.current.onplay = () => {
          syncWordsWithAudio(currentUtterance, audioRef.current!);
        };

        audioRef.current.onended = () => {
          removeHighlights();
          currentUtteranceIndexRef.current++;
          playQueue();
        };

        audioRef.current.onerror = (err) => {
          console.error("ElevenLabs audio play error:", err);
          playWithNativeSpeech();
        };

        await audioRef.current.play();
        setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
      } catch (error: any) {
        console.warn("ElevenLabs network error, falling back to native:", error);
        playWithNativeSpeech();
      }
    } else if (voice.isGemini) {
      try {
        const token = await getAuthToken();
        const response = await fetch('/api/gemini/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            text,
            voiceName: voice.id
          }),
        });

        if (!response.ok) {
          playWithNativeSpeech();
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        audioRef.current.src = url;
        audioRef.current.playbackRate = ttsState.rate;

        audioRef.current.onplay = () => {
          syncWordsWithAudio(currentUtterance, audioRef.current!);
        };

        audioRef.current.onended = () => {
          removeHighlights();
          currentUtteranceIndexRef.current++;
          playQueue();
        };

        audioRef.current.onerror = (err) => {
          console.error("Gemini audio play error:", err);
          playWithNativeSpeech();
        };

        await audioRef.current.play();
        setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
      } catch (error: any) {
        console.warn("Gemini network error, falling back to system voice:", error);
        playWithNativeSpeech();
      }
    } else if (voice.isMicrosoft || voice.id === 'ms-antonio-neural') {
      // If native Antonio is available in browser speech synthesis, use it directly
      if (voice.nativeVoice) {
        playWithNativeSpeech();
      } else {
        try {
          const token = await auth.currentUser?.getIdToken();
          const response = await fetch('/api/microsoft/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ text, voiceName: 'pt-BR-AntonioNeural' }),
          });

          if (!response.ok) {
            playWithNativeSpeech();
            return;
          }

          const blob = await response.blob();
          const url = URL.createObjectURL(blob);

          if (!audioRef.current) {
            audioRef.current = new Audio();
          }

          audioRef.current.src = url;
          audioRef.current.playbackRate = ttsState.rate;

          audioRef.current.onplay = () => {
            syncWordsWithAudio(currentUtterance, audioRef.current!);
          };

          audioRef.current.onended = () => {
            removeHighlights();
            currentUtteranceIndexRef.current++;
            playQueue();
          };

          audioRef.current.onerror = () => {
            playWithNativeSpeech();
          };

          await audioRef.current.play();
          setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
        } catch {
          playWithNativeSpeech();
        }
      }
    } else if (voice.isOpenAI) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/openai/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ text, voiceName: voice.id }),
        });

        if (!response.ok) {
          playWithNativeSpeech();
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        audioRef.current.src = url;
        audioRef.current.playbackRate = ttsState.rate;

        audioRef.current.onplay = () => {
          syncWordsWithAudio(currentUtterance, audioRef.current!);
        };

        audioRef.current.onended = () => {
          removeHighlights();
          currentUtteranceIndexRef.current++;
          playQueue();
        };

        await audioRef.current.play();
        setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
      } catch (error: any) {
        console.warn("OpenAI voice error, using system speech:", error);
        playWithNativeSpeech();
      }
    } else {
      playWithNativeSpeech();
    }
  }, [ttsState.selectedVoice, ttsState.rate, removeHighlights, scrollElementIntoViewIfNeeded, setWordHighlight, syncWordsWithAudio]);

  // Build clean utterance queue with sentence-level and word-level DOM wrappers
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !fileContent) return;

    const blockSelector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, tr, td, dt, dd';
    let blocks: HTMLElement[] = Array.from(container.querySelectorAll(blockSelector) as NodeListOf<HTMLElement>);
    if (blocks.length === 0) {
      blocks = (Array.from(container.querySelectorAll('div') as NodeListOf<HTMLElement>)).filter(d => !d.querySelector('div'));
    }
    if (blocks.length === 0 && container.textContent?.trim()) {
      blocks = [container];
    }

    const queue: UtteranceItem[] = [];
    let globalUtteranceId = 0;

    blocks.forEach((block: HTMLElement) => {
      const rawText = (block.textContent || '').trim();
      if (!rawText) return;

      const isHeading = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block.tagName.toLowerCase());

      // If already has .tts-sentence spans, extract them directly
      const existingSentences: HTMLElement[] = Array.from(block.querySelectorAll('.tts-sentence') as NodeListOf<HTMLElement>);
      if (existingSentences.length > 0) {
        existingSentences.forEach(sEl => {
          const sText = (sEl.textContent || '').trim();
          if (!sText) return;
          const wordEls: HTMLElement[] = Array.from(sEl.querySelectorAll('.tts-word') as NodeListOf<HTMLElement>);
          const words = mapWordsToOffsets(sText, wordEls);
          queue.push({
            id: globalUtteranceId++,
            text: sText,
            sentenceElement: sEl,
            wordElements: wordEls,
            words,
            blockElement: block,
          });
        });
        return;
      }

      // If block has simple text content without HTML tags:
      if (block.children.length === 0) {
        const sentenceStrings = (isHeading || rawText.length < 60)
          ? [rawText]
          : (rawText.match(/[^.!?:\n]+(?:[.!?:\n]+|$)/g) || [rawText]);

        const sentenceWrappers: string[] = [];
        sentenceStrings.forEach(s => {
          const trimmed = s.trim();
          if (!trimmed) return;
          const tokens = trimmed.split(/(\s+)/);
          let wIdx = 0;
          const wordsHtml = tokens.map(token => {
            if (/^\s+$/.test(token)) return token;
            return `<span class="tts-word" data-word-index="${wIdx++}">${escapeHtml(token)}</span>`;
          }).join('');
          sentenceWrappers.push(`<span class="tts-sentence">${wordsHtml}</span>`);
        });

        block.innerHTML = sentenceWrappers.join(' ');

        const newSentenceEls: HTMLElement[] = Array.from(block.querySelectorAll('.tts-sentence') as NodeListOf<HTMLElement>);
        newSentenceEls.forEach(sEl => {
          const sText = (sEl.textContent || '').trim();
          if (!sText) return;
          const wordEls: HTMLElement[] = Array.from(sEl.querySelectorAll('.tts-word') as NodeListOf<HTMLElement>);
          const words = mapWordsToOffsets(sText, wordEls);
          queue.push({
            id: globalUtteranceId++,
            text: sText,
            sentenceElement: sEl,
            wordElements: wordEls,
            words,
            blockElement: block,
          });
        });
      } else {
        // Block has child elements (<b>, <mark>, etc.): wrap text nodes without destroying child elements
        wrapTextNodesInWords(block);

        const wordEls: HTMLElement[] = Array.from(block.querySelectorAll('.tts-word') as NodeListOf<HTMLElement>);
        if (wordEls.length === 0) {
          queue.push({
            id: globalUtteranceId++,
            text: rawText,
            sentenceElement: block,
            wordElements: [],
            words: [],
            blockElement: block,
          });
          return;
        }

        if (isHeading || rawText.length < 80) {
          block.classList.add('tts-sentence');
          const words = mapWordsToOffsets(rawText, wordEls);
          queue.push({
            id: globalUtteranceId++,
            text: rawText,
            sentenceElement: block,
            wordElements: wordEls,
            words,
            blockElement: block,
          });
        } else {
          // Group words into sentences based on terminal punctuation
          let currentGroup: HTMLElement[] = [];
          const sentenceGroups: HTMLElement[][] = [];

          wordEls.forEach(wEl => {
            currentGroup.push(wEl);
            const wText = (wEl.textContent || '').trim();
            if (/[.!?:\n]$/.test(wText)) {
              sentenceGroups.push(currentGroup);
              currentGroup = [];
            }
          });
          if (currentGroup.length > 0) {
            sentenceGroups.push(currentGroup);
          }

          sentenceGroups.forEach(group => {
            const sText = group.map(w => w.textContent || '').join(' ').trim();
            if (!sText) return;
            const sentenceElement = (group[0].parentElement as HTMLElement) || block;
            const words = mapWordsToOffsets(sText, group);
            queue.push({
              id: globalUtteranceId++,
              text: sText,
              sentenceElement,
              wordElements: group,
              words,
              blockElement: block,
            });
          });
        }
      }
    });

    utteranceQueueRef.current = queue;
  }, [contentRef, fileContent]);

  const seekToTextOrNode = useCallback((targetNode?: Node | null, selectedText?: string, startPlaying = true) => {
    const queue = utteranceQueueRef.current;
    if (queue.length === 0) return false;

    let targetIndex = -1;
    const cleanSearchText = (selectedText || '').trim().toLowerCase();

    // 1. Search by DOM Node inclusion
    if (targetNode) {
      for (let i = 0; i < queue.length; i++) {
        const u = queue[i];
        if (
          u.sentenceElement.contains(targetNode) ||
          targetNode.contains(u.sentenceElement) ||
          u.wordElements.some(w => w.contains(targetNode) || targetNode.contains(w))
        ) {
          targetIndex = i;
          break;
        }
      }
    }

    // 2. Search by text matching
    if (targetIndex === -1 && cleanSearchText.length >= 3) {
      for (let i = 0; i < queue.length; i++) {
        const uText = queue[i].text.toLowerCase();
        if (uText.includes(cleanSearchText) || cleanSearchText.includes(uText)) {
          targetIndex = i;
          break;
        }
      }
    }

    if (targetIndex !== -1) {
      currentUtteranceIndexRef.current = targetIndex;
      userScrolledRef.current = false;
      setIsAutoScrollPaused(false);

      if (startPlaying || ttsState.isSpeaking || (!audioRef.current?.paused && audioRef.current?.src)) {
        cleanupSpeech();
        setTimeout(() => {
          if (window.speechSynthesis) window.speechSynthesis.resume();
          playQueue();
        }, 50);
      }
      return true;
    }

    return false;
  }, [ttsState.isSpeaking, cleanupSpeech, playQueue]);

  const handlePlayFromNode = useCallback((targetNode?: Node | null, selectedText?: string) => {
    seekToTextOrNode(targetNode, selectedText, true);
  }, [seekToTextOrNode]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && container.contains(target)) {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        seekToTextOrNode(target, text, true);
      }
    };

    container.addEventListener('dblclick', handleDblClick);
    return () => {
      container.removeEventListener('dblclick', handleDblClick);
    };
  }, [seekToTextOrNode, contentRef]);

  const handlePlay = useCallback(() => {
    if (!contentRef.current || !ttsState.selectedVoice) return;

    userScrolledRef.current = false;
    setIsAutoScrollPaused(false);

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (text && contentRef.current.contains(range.commonAncestorContainer)) {
        seekToTextOrNode(range.startContainer, text, true);
        return;
      }
    }

    if (ttsState.isPaused) {
      if (ttsState.selectedVoice.isElevenLabs || ttsState.selectedVoice.isOpenAI) {
        if (!audioRef.current?.src || audioRef.current.src.endsWith('/')) {
          playQueue();
        } else {
          audioRef.current?.play();
        }
      } else {
        if (!window.speechSynthesis.speaking) {
          playQueue();
        } else {
          window.speechSynthesis.resume();
        }
      }
      setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
    } else {
      cleanupSpeech();
      if (currentUtteranceIndexRef.current >= utteranceQueueRef.current.length) {
        currentUtteranceIndexRef.current = 0;
      }
      setTimeout(() => {
        if (window.speechSynthesis) window.speechSynthesis.resume();
        playQueue();
      }, 50);
    }
  }, [contentRef, ttsState.isPaused, ttsState.selectedVoice, playQueue, cleanupSpeech, seekToTextOrNode]);

  const handlePause = useCallback(() => {
    if (audioRafRef.current) {
      cancelAnimationFrame(audioRafRef.current);
      audioRafRef.current = null;
    }
    if (ttsState.selectedVoice?.isOpenAI || ttsState.selectedVoice?.isElevenLabs) {
      audioRef.current?.pause();
    } else {
      window.speechSynthesis.pause();
    }
    setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: true }));
  }, [ttsState.selectedVoice]);

  const handleStop = useCallback(() => {
    cleanupSpeech();
    setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
    currentUtteranceIndexRef.current = 0;
    userScrolledRef.current = false;
    setIsAutoScrollPaused(false);
  }, [cleanupSpeech]);

  const handleSetVoice = useCallback((voice: Voice) => {
    const wasSpeaking = ttsState.isSpeaking;
    const wasPaused = ttsState.isPaused;

    cleanupSpeech();
    try {
      localStorage.setItem('readerai_selected_voice', voice.id);
    } catch {}
    setTtsState(prev => ({ ...prev, selectedVoice: voice, isSpeaking: false, isPaused: wasPaused }));

    if (wasSpeaking && utteranceQueueRef.current.length > 0) {
      resumePlaybackRef.current = true;
    }
  }, [ttsState.isSpeaking, ttsState.isPaused, cleanupSpeech]);

  const handleSetRate = useCallback((rate: number) => {
    setTtsState(prev => ({ ...prev, rate }));
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (resumePlaybackRef.current) {
      timeoutId = setTimeout(() => {
        playQueue();
        resumePlaybackRef.current = false;
      }, 100);
    }
    return () => clearTimeout(timeoutId);
  }, [ttsState.selectedVoice, playQueue]);

  const skipSentence = useCallback((direction: 'next' | 'previous') => {
    if (utteranceQueueRef.current.length === 0) return;
    cleanupSpeech();
    userScrolledRef.current = false;
    setIsAutoScrollPaused(false);

    let newIndex;
    if (direction === 'next') {
      newIndex = Math.min(currentUtteranceIndexRef.current + 1, utteranceQueueRef.current.length - 1);
    } else {
      newIndex = Math.max(0, currentUtteranceIndexRef.current - 1);
    }

    currentUtteranceIndexRef.current = newIndex;
    setTimeout(() => {
      playQueue();
    }, 50);
  }, [cleanupSpeech, playQueue]);

  const handleNextSentence = useCallback(() => skipSentence('next'), [skipSentence]);
  const handlePreviousSentence = useCallback(() => skipSentence('previous'), [skipSentence]);

  // Voice Command integration
  const processCommandRef = useRef<(cmd: string) => void>(() => {});
  useEffect(() => {
    processCommandRef.current = (command: string) => {
      const lower = command.toLowerCase().trim();
      if (SUPPORTED_COMMANDS.play.some(c => lower.includes(c))) {
        handlePlay();
      } else if (SUPPORTED_COMMANDS.pause.some(c => lower.includes(c))) {
        handlePause();
      } else if (SUPPORTED_COMMANDS.next.some(c => lower.includes(c))) {
        handleNextSentence();
      } else if (SUPPORTED_COMMANDS.previous.some(c => lower.includes(c))) {
        handlePreviousSentence();
      } else if (SUPPORTED_COMMANDS.restart.some(c => lower.includes(c))) {
        currentUtteranceIndexRef.current = 0;
        handlePlay();
      }
    };
  }, [handlePlay, handlePause, handleNextSentence, handlePreviousSentence]);

  const toggleListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Comandos de voz não suportados neste navegador.");
      return;
    }

    if (recognitionState.isListening) {
      recognitionRef.current?.stop();
      setRecognitionState(prev => ({ ...prev, isListening: false }));
    } else {
      if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'pt-BR';
      }
      recognitionRef.current.onresult = (event: any) => processCommandRef.current(event.results[0][0].transcript);
      recognitionRef.current.onerror = (event: any) => console.error("Speech recognition error", event.error);
      recognitionRef.current.onend = () => setRecognitionState(prev => ({ ...prev, isListening: false }));

      recognitionRef.current.start();
      setRecognitionState(prev => ({ ...prev, isListening: true }));
    }
  }, [recognitionState.isListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      cleanupSpeech();
    };
  }, [cleanupSpeech]);

  // Standalone speech helper (useful for list items and alarms)
  const speakStandalone = useCallback(async (text: string, customVoice?: Voice) => {
    if (!text.trim()) return;
    const voiceToUse = customVoice || ttsState.selectedVoice;

    if (voiceToUse?.isElevenLabs || voiceToUse?.provider === 'elevenlabs') {
      try {
        const token = await getAuthToken();
        const response = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ text, voiceId: voiceToUse.id })
        });
        if (response.ok) {
          const blob = await response.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.playbackRate = ttsState.rate;
          await audio.play();
          return;
        }
      } catch (e) {
        console.warn("ElevenLabs standalone speech fallback:", e);
      }
    } else if (voiceToUse?.isGemini) {
      try {
        const token = await getAuthToken();
        const response = await fetch('/api/gemini/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ text, voiceName: voiceToUse.id })
        });
        if (response.ok) {
          const blob = await response.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.playbackRate = ttsState.rate;
          await audio.play();
          return;
        }
      } catch (e) {
        console.warn("Gemini standalone speech fallback:", e);
      }
    } else if (voiceToUse?.isMicrosoft || voiceToUse?.id === 'ms-antonio-neural') {
      if (voiceToUse.nativeVoice && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voiceToUse.nativeVoice;
        u.lang = 'pt-BR';
        u.rate = ttsState.rate;
        window.speechSynthesis.speak(u);
        return;
      }
    } else if (voiceToUse?.isOpenAI) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/openai/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ text, voiceName: voiceToUse.id })
        });
        if (response.ok) {
          const blob = await response.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.playbackRate = ttsState.rate;
          await audio.play();
          return;
        }
      } catch (e) {
        console.warn("OpenAI standalone speech fallback:", e);
      }
    }

    // Native fallback
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      if (voiceToUse?.nativeVoice) u.voice = voiceToUse.nativeVoice;
      u.lang = 'pt-BR';
      u.rate = ttsState.rate;
      window.speechSynthesis.speak(u);
    }
  }, [ttsState.selectedVoice, ttsState.rate]);

  return {
    ttsState,
    recognitionState,
    isAutoScrollPaused,
    handleResumeAutoScroll,
    handleSetVoice,
    handleSetRate,
    handlePlay,
    handlePlayFromNode,
    handlePause,
    handleStop,
    toggleListening,
    handleNextSentence,
    handlePreviousSentence,
    speakStandalone,
  };
};
