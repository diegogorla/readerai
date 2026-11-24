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
  const skippedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'BUTTON', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.tts-word')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (skippedTags.has(parent.tagName)) {
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

function buildWordIntervals(words: UtteranceWord[]) {
  let accum = 0;
  const intervals = words.map(w => {
    const pauseBonus = /[.!?]$/.test(w.text) ? 4 : /[,;:]$/.test(w.text) ? 2 : 0;
    const weight = Math.max(2, w.text.length) + pauseBonus;
    const start = accum;
    accum += weight;
    const end = accum;
    return { w, start, end, weight };
  });
  return { intervals, totalWeight: Math.max(1, accum) };
}

export const useSpeech = (
  contentRef: RefObject<HTMLDivElement | null>,
  fileContent?: string,
  activeDocumentId?: string | null,
  isDocumentVisible: boolean = true
) => {
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
  const startWordOffsetRef = useRef(0);
  const activeWordsRef = useRef<UtteranceWord[]>([]);
  const recognitionRef = useRef<any>(null);
  const resumePlaybackRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentHighlightedWordRef = useRef<HTMLElement | null>(null);
  const activeSentenceElsRef = useRef<HTMLElement[]>([]);
  const audioRafRef = useRef<number | null>(null);
  const nativeFallbackRafRef = useRef<number | null>(null);
  const builtForContainerRef = useRef<HTMLDivElement | null>(null);
  const builtForRevisionRef = useRef<string | undefined>(undefined);
  const playbackSessionIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingPlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll control refs
  const userScrolledRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stop auto-scroll only on explicit user scroll input
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

    return () => {
      window.removeEventListener('wheel', handleUserScroll, { capture: true });
      window.removeEventListener('touchmove', handleUserScroll, { capture: true });
    };
  }, []);

  const stopHighlightAnimLoops = useCallback(() => {
    if (audioRafRef.current) {
      cancelAnimationFrame(audioRafRef.current);
      audioRafRef.current = null;
    }
    if (nativeFallbackRafRef.current) {
      cancelAnimationFrame(nativeFallbackRafRef.current);
      nativeFallbackRafRef.current = null;
    }
  }, []);

  const removeHighlights = useCallback(() => {
    stopHighlightAnimLoops();
    if (contentRef.current) {
      const activeElements = contentRef.current.querySelectorAll(
        '.tts-active-sentence, .tts-active-sentence-word, .tts-current-word'
      );
      activeElements.forEach(el =>
        el.classList.remove('tts-active-sentence', 'tts-active-sentence-word', 'tts-current-word')
      );
    }
    if (activeSentenceElsRef.current.length > 0) {
      activeSentenceElsRef.current.forEach(el =>
        el.classList.remove('tts-active-sentence', 'tts-active-sentence-word')
      );
      activeSentenceElsRef.current = [];
    }
    if (currentHighlightedWordRef.current) {
      currentHighlightedWordRef.current.classList.remove('tts-current-word');
      currentHighlightedWordRef.current = null;
    }
  }, [contentRef, stopHighlightAnimLoops]);

  const cleanupSpeech = useCallback(() => {
    // Invalidate all in-flight async TTS requests, callbacks, and timers immediately
    playbackSessionIdRef.current += 1;

    if (pendingPlayTimeoutRef.current) {
      clearTimeout(pendingPlayTimeoutRef.current);
      pendingPlayTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopHighlightAnimLoops();
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current.onboundary = null;
      currentUtteranceRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      // Clear ALL event handlers BEFORE pausing/removing src so onerror NEVER triggers fallback voice!
      audioRef.current.onplay = null;
      audioRef.current.onplaying = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onpause = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    removeHighlights();
  }, [removeHighlights, stopHighlightAnimLoops]);

  // Smooth auto-scroll keeping word/sentence comfortably centered
  const scrollElementIntoViewIfNeeded = useCallback((element: HTMLElement, forceCenter = false) => {
    if (userScrolledRef.current || !element.isConnected) return;

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
      }, 1050);
    }
  }, []);

  const setWordHighlight = useCallback((wordEl: HTMLElement) => {
    if (!wordEl || !wordEl.isConnected) return;
    if (currentHighlightedWordRef.current === wordEl && wordEl.classList.contains('tts-current-word')) return;

    if (currentHighlightedWordRef.current) {
      currentHighlightedWordRef.current.classList.remove('tts-current-word');
    }

    wordEl.classList.add('tts-current-word');
    currentHighlightedWordRef.current = wordEl;

    if (!userScrolledRef.current) {
      scrollElementIntoViewIfNeeded(wordEl, false);
    }
  }, [scrollElementIntoViewIfNeeded]);

  const applySentenceHighlight = useCallback((utterance: UtteranceItem, activeWordEls: HTMLElement[]) => {
    removeHighlights();

    const tracked: HTMLElement[] = [];
    if (
      utterance.sentenceElement &&
      utterance.sentenceElement.isConnected &&
      utterance.sentenceElement.classList.contains('tts-sentence')
    ) {
      utterance.sentenceElement.classList.add('tts-active-sentence');
      tracked.push(utterance.sentenceElement);
    }

    // Also highlight every word in the active sentence so multi-sentence rich HTML blocks
    // (containing <b>, <i>, <mark>, <a>, <br>) highlight ONLY the active sentence cleanly.
    utterance.wordElements.forEach(wEl => {
      if (wEl.isConnected) {
        wEl.classList.add('tts-active-sentence-word');
        tracked.push(wEl);
      }
    });

    activeSentenceElsRef.current = tracked;

    const firstWord = activeWordEls[0] || utterance.wordElements[0];
    if (firstWord && firstWord.isConnected) {
      setWordHighlight(firstWord);
    }
  }, [removeHighlights, setWordHighlight]);

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

  // Helper to retrieve Firebase ID token
  const getAuthToken = useCallback(async () => {
    if (auth.currentUser) {
      try {
        return await auth.currentUser.getIdToken();
      } catch {}
    }
    return null;
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

  // Build clean utterance queue with sentence-level and word-level DOM wrappers
  const buildUtteranceQueue = useCallback((): UtteranceItem[] => {
    const container = contentRef.current;
    if (!container) {
      utteranceQueueRef.current = [];
      builtForContainerRef.current = null;
      builtForRevisionRef.current = undefined;
      return [];
    }

    const blockSelector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, tr, td, dt, dd';
    const rawBlocks = Array.from(container.querySelectorAll(blockSelector) as NodeListOf<HTMLElement>);
    // Avoid duplicating utterances when block elements are nested (e.g., <tr><td><p>, <blockquote><p>)
    let blocks = rawBlocks.filter(b => !b.querySelector(blockSelector));
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
          let wordEls: HTMLElement[] = Array.from(sEl.querySelectorAll('.tts-word') as NodeListOf<HTMLElement>);
          if (wordEls.length === 0) {
            wrapTextNodesInWords(sEl);
            wordEls = Array.from(sEl.querySelectorAll('.tts-word') as NodeListOf<HTMLElement>);
          }
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
        // Block has child elements (<b>, <mark>, <a>, <br>, etc.): wrap text nodes without destroying tags
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
          // Group words into sentences based on terminal punctuation or explicit <br> breaks
          let currentGroup: HTMLElement[] = [];
          const sentenceGroups: HTMLElement[][] = [];

          const hasBrBetween = (prevEl: HTMLElement, nextEl: HTMLElement): boolean => {
            try {
              const range = document.createRange();
              range.setStartAfter(prevEl);
              range.setEndBefore(nextEl);
              const frag = range.cloneContents();
              return Boolean(frag.querySelector('br'));
            } catch {
              return false;
            }
          };

          wordEls.forEach((wEl, idx) => {
            if (idx > 0 && currentGroup.length > 0 && hasBrBetween(wordEls[idx - 1], wEl)) {
              sentenceGroups.push(currentGroup);
              currentGroup = [];
            }
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
            const sentenceElement = sentenceGroups.length === 1 ? block : (group[0] as HTMLElement);
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
    builtForContainerRef.current = container;
    builtForRevisionRef.current = container.dataset.ttsDomRevision;
    return queue;
  }, [contentRef]);

  // Self-healing guard: guarantees utteranceQueueRef always references live, connected DOM nodes
  const ensureQueueReady = useCallback((): UtteranceItem[] => {
    const container = contentRef.current;
    if (!container) return [];

    const existing = utteranceQueueRef.current;
    const firstItem = existing[0];
    const firstWord = firstItem?.wordElements?.[0];
    const isStale =
      existing.length === 0 ||
      builtForContainerRef.current !== container ||
      builtForRevisionRef.current !== container.dataset.ttsDomRevision ||
      !firstItem?.sentenceElement?.isConnected ||
      (firstWord ? !firstWord.isConnected : false);

    if (isStale) {
      return buildUtteranceQueue();
    }
    return existing;
  }, [contentRef, buildUtteranceQueue]);

  // Reset playback index when switching active documents
  useEffect(() => {
    currentUtteranceIndexRef.current = 0;
    startWordOffsetRef.current = 0;
  }, [activeDocumentId]);

  // Rebuild utterance queue when content, document, or visibility changes
  useEffect(() => {
    if (!fileContent || !isDocumentVisible) return;

    buildUtteranceQueue();
    // Retry on next frame in case ContentDisplay/AnimatePresence mounts the DOM node asynchronously
    const rafId = requestAnimationFrame(() => {
      ensureQueueReady();
    });

    return () => cancelAnimationFrame(rafId);
  }, [contentRef, fileContent, activeDocumentId, isDocumentVisible, buildUtteranceQueue, ensureQueueReady]);

  // Synchronize words with server audio playback via requestAnimationFrame
  const syncWordsWithAudio = useCallback((words: UtteranceWord[], audio: HTMLAudioElement, sessionId: number) => {
    if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
    if (words.length === 0) return;

    const { intervals, totalWeight } = buildWordIntervals(words);

    if (words[0]?.el?.isConnected && !currentHighlightedWordRef.current) {
      setWordHighlight(words[0].el);
    }

    const checkFrame = () => {
      if (sessionId !== playbackSessionIdRef.current) return;
      if (!audio || audio.ended) return;
      if (audio.paused) {
        audioRafRef.current = null;
        return;
      }

      const rawDuration = audio.duration;
      const hasFiniteDuration = Number.isFinite(rawDuration) && rawDuration > 0.05;
      // Guard against Blob MP3s with Infinity or NaN duration until browser metadata resolves
      const rate = Math.max(0.5, audio.playbackRate || 1);
      const estimatedDuration = Math.max(0.5, totalWeight / (14.5 * rate));
      const effectiveDuration = hasFiniteDuration ? rawDuration : estimatedDuration;

      const curTime = Math.max(0, audio.currentTime || 0);
      const progress = Math.min(0.999, Math.max(0, curTime / effectiveDuration));
      const targetPos = progress * totalWeight;

      let match = intervals.find(t => targetPos >= t.start && targetPos < t.end);
      if (!match && intervals.length > 0) {
        match = intervals[progress >= 0.99 ? intervals.length - 1 : 0];
      }

      if (match?.w.el?.isConnected) {
        setWordHighlight(match.w.el);
      }

      audioRafRef.current = requestAnimationFrame(checkFrame);
    };

    audioRafRef.current = requestAnimationFrame(checkFrame);
  }, [setWordHighlight]);

  // Smooth estimated word highlight fallback for native Web Speech voices that never emit onboundary
  const startNativeWordFallback = useCallback((words: UtteranceWord[], rate: number, sessionId: number) => {
    if (nativeFallbackRafRef.current) {
      cancelAnimationFrame(nativeFallbackRafRef.current);
      nativeFallbackRafRef.current = null;
    }
    if (words.length === 0) return;

    const { intervals, totalWeight } = buildWordIntervals(words);
    const effectiveRate = Math.max(0.5, rate || 1);
    const estimatedDurationMs = Math.max(450, (totalWeight / (14.5 * effectiveRate)) * 1000);

    let lastTimestamp = performance.now();
    let elapsedMs = 0;

    if (words[0]?.el?.isConnected) {
      setWordHighlight(words[0].el);
    }

    const tick = (now: number) => {
      if (sessionId !== playbackSessionIdRef.current) return;

      const dt = Math.min(200, Math.max(0, now - lastTimestamp));
      lastTimestamp = now;

      if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
        nativeFallbackRafRef.current = requestAnimationFrame(tick);
        return;
      }

      elapsedMs += dt;
      const progress = Math.min(0.999, Math.max(0, elapsedMs / estimatedDurationMs));
      const targetPos = progress * totalWeight;

      let match = intervals.find(t => targetPos >= t.start && targetPos < t.end);
      if (!match && intervals.length > 0) {
        match = intervals[intervals.length - 1];
      }

      if (match?.w.el?.isConnected) {
        setWordHighlight(match.w.el);
      }

      if (progress < 0.999) {
        nativeFallbackRafRef.current = requestAnimationFrame(tick);
      } else {
        nativeFallbackRafRef.current = null;
      }
    };

    nativeFallbackRafRef.current = requestAnimationFrame(tick);
  }, [setWordHighlight]);

  // Playback queue runner with strict session guards, sentence highlighting, word tracking, and smooth scrolling
  const playQueue = useCallback(async (expectedSessionId?: number) => {
    const sessionId = expectedSessionId ?? playbackSessionIdRef.current;
    if (sessionId !== playbackSessionIdRef.current) return;

    const queue = ensureQueueReady();
    if (queue.length === 0 || currentUtteranceIndexRef.current >= queue.length) {
      setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
      removeHighlights();
      return;
    }

    const currentUtterance = queue[currentUtteranceIndexRef.current];
    const sentenceElement = currentUtterance.sentenceElement;
    const voice = ttsState.selectedVoice;

    if (!voice) return;

    // Support starting mid-sentence when user selects a specific phrase and hits Play
    const wordOffset = startWordOffsetRef.current;
    startWordOffsetRef.current = 0;

    const activeWordEls =
      wordOffset > 0 && wordOffset < currentUtterance.wordElements.length
        ? currentUtterance.wordElements.slice(wordOffset)
        : currentUtterance.wordElements;

    const text =
      wordOffset > 0 && activeWordEls.length > 0
        ? activeWordEls.map(el => (el.textContent || '').trim()).filter(Boolean).join(' ')
        : currentUtterance.text;

    const activeWords =
      wordOffset > 0 && activeWordEls.length > 0
        ? mapWordsToOffsets(text, activeWordEls)
        : currentUtterance.words;

    activeWordsRef.current = activeWords;

    if (!text.trim()) {
      currentUtteranceIndexRef.current++;
      playQueue(sessionId);
      return;
    }

    applySentenceHighlight(currentUtterance, activeWordEls);

    const focusTarget = activeWordEls[0] || currentUtterance.wordElements[0] || sentenceElement;
    if (focusTarget && !userScrolledRef.current) {
      scrollElementIntoViewIfNeeded(focusTarget, true);
    }

    // Native Web Speech API execution helper (strictly guarded by sessionId)
    const playWithNativeSpeech = () => {
      if (sessionId !== playbackSessionIdRef.current) return;
      if (!('speechSynthesis' in window)) return;

      // Guarantee HTMLAudioElement is completely silent before starting Web Speech
      if (audioRef.current) {
        audioRef.current.onplay = null;
        audioRef.current.onplaying = null;
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.onpause = null;
        audioRef.current.pause();
      }
      if (currentUtteranceRef.current) {
        currentUtteranceRef.current.onstart = null;
        currentUtteranceRef.current.onend = null;
        currentUtteranceRef.current.onerror = null;
        currentUtteranceRef.current.onboundary = null;
      }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice.nativeVoice) {
        utterance.voice = voice.nativeVoice;
      } else {
        const browserVoices = window.speechSynthesis.getVoices();
        const bestVoice = browserVoices.find(v => v.lang.startsWith('pt')) || browserVoices[0];
        if (bestVoice) utterance.voice = bestVoice;
      }
      utterance.lang = voice.lang || 'pt-BR';
      utterance.rate = ttsState.rate;

      (window as any).currentUtterance = utterance;

      let receivedRealBoundary = false;

      utterance.onstart = () => {
        if (sessionId !== playbackSessionIdRef.current) return;
        if (activeWords[0]?.el?.isConnected) {
          setWordHighlight(activeWords[0].el);
        }
        if (!receivedRealBoundary) {
          startNativeWordFallback(activeWords, ttsState.rate, sessionId);
        }
      };

      utterance.onboundary = (e: any) => {
        if (sessionId !== playbackSessionIdRef.current) return;
        if (typeof e.charIndex === 'number' && (!e.name || e.name === 'word')) {
          if (!receivedRealBoundary) {
            receivedRealBoundary = true;
            if (nativeFallbackRafRef.current) {
              cancelAnimationFrame(nativeFallbackRafRef.current);
              nativeFallbackRafRef.current = null;
            }
          }
          const charIndex = e.charIndex;
          let match = activeWords.find(w => charIndex >= w.startChar && charIndex < w.endChar);
          if (!match) {
            match = activeWords.find(w => w.startChar >= charIndex);
          }
          if (!match && activeWords.length > 0) {
            match = activeWords[activeWords.length - 1];
          }
          if (match?.el?.isConnected) {
            setWordHighlight(match.el);
          }
        }
      };

      utterance.onend = () => {
        if (sessionId !== playbackSessionIdRef.current) return;
        removeHighlights();
        currentUtteranceIndexRef.current++;
        playQueue(sessionId);
      };

      utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (sessionId !== playbackSessionIdRef.current) return;
        removeHighlights();
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.error("Speech synthesis error:", e.error);
        setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
    };

    // Shared server audio player helper (strictly guarded by sessionId)
    const playServerAudio = async (endpoint: string, payload: Record<string, any>) => {
      if (sessionId !== playbackSessionIdRef.current) return;

      // Cancel any previous fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Mark speaking immediately so UI shows active state while fetching
      setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));

      try {
        const token = await getAuthToken();
        if (sessionId !== playbackSessionIdRef.current) return;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (sessionId !== playbackSessionIdRef.current) return;

        if (!response.ok) {
          console.warn(`TTS endpoint ${endpoint} error (${response.status}), falling back to native`);
          playWithNativeSpeech();
          return;
        }

        const blob = await response.blob();
        if (sessionId !== playbackSessionIdRef.current) return;

        const url = URL.createObjectURL(blob);
        if (currentBlobUrlRef.current) {
          URL.revokeObjectURL(currentBlobUrlRef.current);
        }
        currentBlobUrlRef.current = url;

        // Guarantee native speech is cancelled before playing audio element
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        audio.onplay = null;
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        audio.pause();

        audio.src = url;
        audio.playbackRate = ttsState.rate;

        const beginAudioSync = () => {
          if (sessionId !== playbackSessionIdRef.current) {
            audio.pause();
            return;
          }
          syncWordsWithAudio(activeWords, audio, sessionId);
        };

        audio.onplay = beginAudioSync;
        audio.onplaying = beginAudioSync;

        audio.onended = () => {
          if (sessionId !== playbackSessionIdRef.current) return;
          removeHighlights();
          currentUtteranceIndexRef.current++;
          playQueue(sessionId);
        };

        audio.onerror = (err) => {
          if (sessionId !== playbackSessionIdRef.current) return;
          console.error(`Audio play error (${endpoint}):`, err);
          playWithNativeSpeech();
        };

        await audio.play();
        if (sessionId !== playbackSessionIdRef.current) {
          audio.onplay = null;
          audio.onplaying = null;
          audio.onended = null;
          audio.onerror = null;
          audio.pause();
          return;
        }
        syncWordsWithAudio(activeWords, audio, sessionId);
        setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
      } catch (error: any) {
        if (error?.name === 'AbortError' || sessionId !== playbackSessionIdRef.current) {
          return;
        }
        console.warn(`TTS network/play error (${endpoint}), falling back to native:`, error);
        playWithNativeSpeech();
      }
    };

    if (voice.isElevenLabs || voice.provider === 'elevenlabs') {
      await playServerAudio('/api/elevenlabs/tts', {
        text,
        voiceId: voice.id,
        voiceName: voice.name,
      });
    } else if (voice.isGemini) {
      await playServerAudio('/api/gemini/tts', {
        text,
        voiceName: voice.id,
      });
    } else if (voice.isMicrosoft || voice.id === 'ms-antonio-neural') {
      if (voice.nativeVoice) {
        playWithNativeSpeech();
      } else {
        await playServerAudio('/api/microsoft/tts', {
          text,
          voiceName: 'pt-BR-AntonioNeural',
        });
      }
    } else if (voice.isOpenAI) {
      await playServerAudio('/api/openai/tts', {
        text,
        voiceName: voice.id,
      });
    } else {
      playWithNativeSpeech();
    }
  }, [
    ensureQueueReady,
    ttsState.selectedVoice,
    ttsState.rate,
    getAuthToken,
    removeHighlights,
    applySentenceHighlight,
    scrollElementIntoViewIfNeeded,
    setWordHighlight,
    syncWordsWithAudio,
    startNativeWordFallback,
  ]);

  const seekToTextOrNode = useCallback((
    targetNode?: Node | null,
    selectedText?: string,
    startPlaying = true,
    range?: Range | null
  ) => {
    const queue = ensureQueueReady();
    if (queue.length === 0) return false;

    let targetIndex = -1;
    let targetWordIndex = 0;
    const cleanSearchText = (selectedText || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // 1. Exact DOM Range intersection against word elements (pinpoints exact sentence AND exact starting word)
    if (range) {
      for (let i = 0; i < queue.length; i++) {
        const u = queue[i];
        for (let wIdx = 0; wIdx < u.wordElements.length; wIdx++) {
          const wEl = u.wordElements[wIdx];
          try {
            if (!range.intersectsNode(wEl)) continue;
            // Skip trailing edge of previous word if selection starts right at the end of its text node
            if (
              (wEl === range.startContainer || wEl.contains(range.startContainer)) &&
              range.startContainer.nodeType === Node.TEXT_NODE &&
              range.startOffset >= (range.startContainer.nodeValue?.length || 0)
            ) {
              continue;
            }
            targetIndex = i;
            targetWordIndex = wIdx;
            break;
          } catch {}
        }
        if (targetIndex !== -1) break;
      }
    }

    // 2. Search by DOM Node containment against word elements FIRST (avoids shared blockElement false match)
    if (targetIndex === -1 && targetNode) {
      for (let i = 0; i < queue.length; i++) {
        const u = queue[i];
        const wIdx = u.wordElements.findIndex(w => w.contains(targetNode) || targetNode.contains(w));
        if (wIdx !== -1) {
          targetIndex = i;
          targetWordIndex = wIdx;
          break;
        }
      }
    }

    // 3. Dedicated sentence element match (only when sentenceElement is NOT shared across multiple utterances)
    if (targetIndex === -1 && targetNode) {
      for (let i = 0; i < queue.length; i++) {
        const u = queue[i];
        if (
          u.sentenceElement !== u.blockElement &&
          (u.sentenceElement.contains(targetNode) || targetNode.contains(u.sentenceElement))
        ) {
          targetIndex = i;
          targetWordIndex = 0;
          break;
        }
      }
    }

    // 4. Text matching fallback (supports selections starting mid-sentence or spanning multiple sentences)
    if (targetIndex === -1 && cleanSearchText.length >= 2) {
      const searchNeedle = cleanSearchText.slice(0, 60);
      for (let i = 0; i < queue.length; i++) {
        const uText = queue[i].text.replace(/\s+/g, ' ').toLowerCase();
        const matchPos = uText.indexOf(searchNeedle);
        if (matchPos !== -1) {
          targetIndex = i;
          const foundWordIdx = queue[i].words.findIndex(w => w.endChar > matchPos);
          targetWordIndex = foundWordIdx !== -1 ? foundWordIdx : 0;
          break;
        }
      }
      // If selection spans multiple sentences, check if the start of selectedText matches the tail of an utterance
      if (targetIndex === -1) {
        const firstWords = cleanSearchText.split(' ').slice(0, 4).join(' ');
        if (firstWords.length >= 2) {
          for (let i = 0; i < queue.length; i++) {
            const uText = queue[i].text.replace(/\s+/g, ' ').toLowerCase();
            const matchPos = uText.indexOf(firstWords);
            if (matchPos !== -1) {
              targetIndex = i;
              const foundWordIdx = queue[i].words.findIndex(w => w.endChar > matchPos);
              targetWordIndex = foundWordIdx !== -1 ? foundWordIdx : 0;
              break;
            }
          }
        }
      }
    }

    if (targetIndex !== -1) {
      currentUtteranceIndexRef.current = targetIndex;
      startWordOffsetRef.current = targetWordIndex;
      userScrolledRef.current = false;
      setIsAutoScrollPaused(false);

      if (startPlaying || ttsState.isSpeaking || (!audioRef.current?.paused && audioRef.current?.src)) {
        cleanupSpeech();
        const nextSessionId = playbackSessionIdRef.current;
        pendingPlayTimeoutRef.current = setTimeout(() => {
          pendingPlayTimeoutRef.current = null;
          if (nextSessionId !== playbackSessionIdRef.current) return;
          if (window.speechSynthesis) window.speechSynthesis.resume();
          playQueue(nextSessionId);
        }, 40);
      }
      return true;
    }

    return false;
  }, [ensureQueueReady, ttsState.isSpeaking, cleanupSpeech, playQueue]);

  const handlePlayFromNode = useCallback((targetNode?: Node | null, selectedText?: string, range?: Range | null) => {
    seekToTextOrNode(targetNode, selectedText, true, range);
  }, [seekToTextOrNode]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && container.contains(target)) {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        seekToTextOrNode(target, text, true, range);
      }
    };

    container.addEventListener('dblclick', handleDblClick);
    return () => {
      container.removeEventListener('dblclick', handleDblClick);
    };
  }, [seekToTextOrNode, contentRef, activeDocumentId, isDocumentVisible]);

  const handlePlay = useCallback((selectionFallback?: { range?: Range; text?: string } | null) => {
    if (!contentRef.current || !ttsState.selectedVoice) return;

    ensureQueueReady();
    userScrolledRef.current = false;
    setIsAutoScrollPaused(false);

    // Check live browser selection first, then fallback to saved selectionInfo
    let activeRange: Range | null = null;
    let activeText = '';

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (text && contentRef.current.contains(range.commonAncestorContainer)) {
        activeRange = range.cloneRange();
        activeText = text;
      }
    }

    if (!activeText && selectionFallback?.text) {
      const fbRange = selectionFallback.range || null;
      const isRangeInDoc = fbRange && contentRef.current.contains(fbRange.commonAncestorContainer);
      activeRange = isRangeInDoc ? fbRange : null;
      activeText = selectionFallback.text.trim();
    }

    if (activeText) {
      const matched = seekToTextOrNode(activeRange?.startContainer || null, activeText, true, activeRange);
      if (matched) {
        if (sel && !sel.isCollapsed) {
          sel.removeAllRanges();
        }
        return;
      }
    }

    if (ttsState.isPaused) {
      const hasPausedAudio = Boolean(
        audioRef.current &&
        audioRef.current.getAttribute('src') &&
        audioRef.current.paused &&
        !audioRef.current.ended
      );

      if (hasPausedAudio && audioRef.current) {
        const currentSession = playbackSessionIdRef.current;
        audioRef.current.play().then(() => {
          if (currentSession === playbackSessionIdRef.current && audioRef.current) {
            syncWordsWithAudio(activeWordsRef.current, audioRef.current, currentSession);
          }
        }).catch(() => {
          cleanupSpeech();
          playQueue(playbackSessionIdRef.current);
        });
        setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
      } else if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
        setTtsState(prev => ({ ...prev, isSpeaking: true, isPaused: false }));
      } else {
        cleanupSpeech();
        const nextSessionId = playbackSessionIdRef.current;
        pendingPlayTimeoutRef.current = setTimeout(() => {
          pendingPlayTimeoutRef.current = null;
          if (nextSessionId !== playbackSessionIdRef.current) return;
          if (window.speechSynthesis) window.speechSynthesis.resume();
          playQueue(nextSessionId);
        }, 40);
      }
    } else {
      cleanupSpeech();
      startWordOffsetRef.current = 0;
      if (currentUtteranceIndexRef.current >= utteranceQueueRef.current.length) {
        currentUtteranceIndexRef.current = 0;
      }
      const nextSessionId = playbackSessionIdRef.current;
      pendingPlayTimeoutRef.current = setTimeout(() => {
        pendingPlayTimeoutRef.current = null;
        if (nextSessionId !== playbackSessionIdRef.current) return;
        if (window.speechSynthesis) window.speechSynthesis.resume();
        playQueue(nextSessionId);
      }, 40);
    }
  }, [contentRef, ensureQueueReady, ttsState.isPaused, ttsState.selectedVoice, playQueue, cleanupSpeech, seekToTextOrNode, syncWordsWithAudio]);

  const handlePause = useCallback(() => {
    const isPlayingAudio = Boolean(audioRef.current && audioRef.current.getAttribute('src') && !audioRef.current.paused);
    const isPlayingNative = Boolean(typeof window !== 'undefined' && window.speechSynthesis?.speaking);

    if (isPlayingAudio && audioRef.current) {
      if (audioRafRef.current) {
        cancelAnimationFrame(audioRafRef.current);
        audioRafRef.current = null;
      }
      audioRef.current.pause();
    } else if (isPlayingNative) {
      // Leave nativeFallbackRafRef idling while speechSynthesis.paused === true so resume continues smoothly
      window.speechSynthesis.pause();
    } else {
      // Abort any in-flight TTS fetch so it doesn't begin playing after user clicked Pause
      stopHighlightAnimLoops();
      playbackSessionIdRef.current += 1;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (pendingPlayTimeoutRef.current) {
        clearTimeout(pendingPlayTimeoutRef.current);
        pendingPlayTimeoutRef.current = null;
      }
    }
    setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: true }));
  }, [stopHighlightAnimLoops]);

  const handleStop = useCallback(() => {
    cleanupSpeech();
    setTtsState(prev => ({ ...prev, isSpeaking: false, isPaused: false }));
    currentUtteranceIndexRef.current = 0;
    startWordOffsetRef.current = 0;
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
      const nextSessionId = playbackSessionIdRef.current;
      timeoutId = setTimeout(() => {
        if (nextSessionId !== playbackSessionIdRef.current) return;
        playQueue(nextSessionId);
        resumePlaybackRef.current = false;
      }, 100);
    }
    return () => clearTimeout(timeoutId);
  }, [ttsState.selectedVoice, playQueue]);

  const skipSentence = useCallback((direction: 'next' | 'previous') => {
    const queue = ensureQueueReady();
    if (queue.length === 0) return;
    cleanupSpeech();
    startWordOffsetRef.current = 0;
    userScrolledRef.current = false;
    setIsAutoScrollPaused(false);

    let newIndex;
    if (direction === 'next') {
      newIndex = Math.min(currentUtteranceIndexRef.current + 1, queue.length - 1);
    } else {
      newIndex = Math.max(0, currentUtteranceIndexRef.current - 1);
    }

    currentUtteranceIndexRef.current = newIndex;
    const nextSessionId = playbackSessionIdRef.current;
    pendingPlayTimeoutRef.current = setTimeout(() => {
      pendingPlayTimeoutRef.current = null;
      if (nextSessionId !== playbackSessionIdRef.current) return;
      playQueue(nextSessionId);
    }, 40);
  }, [ensureQueueReady, cleanupSpeech, playQueue]);

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
