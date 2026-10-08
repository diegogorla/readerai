import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, Trash2, Quote, Play, Square, Volume2, Sparkles, Pencil, Check } from 'lucide-react';
import { Comment, Highlight, Voice } from '../types';

interface CommentSidebarProps {
  comments: Comment[];
  highlights: Highlight[];
  onDeleteComment: (commentId: string) => void;
  onEditComment: (commentId: string, newText: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  selectedVoice?: Voice;
}

export const CommentSidebar: React.FC<CommentSidebarProps> = ({
  comments,
  highlights,
  onDeleteComment,
  onEditComment,
  isOpen,
  onToggle,
  selectedVoice,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlayingId(null);
    setIsPlayingAll(false);
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const handleStartEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditingText(comment.text);
  };

  const handleSaveEdit = (commentId: string) => {
    if (editingText.trim()) {
      onEditComment(commentId, editingText.trim());
    }
    setEditingId(null);
    setEditingText('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const getCleanText = (text: string) => {
    const div = document.createElement('div');
    div.innerHTML = text;
    return (div.textContent || div.innerText || '').trim();
  };

  const fallbackSpeechSynthesis = (text: string, onFinished?: () => void) => {
    if (!('speechSynthesis' in window)) {
      setPlayingId(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice?.nativeVoice) {
      utterance.voice = selectedVoice.nativeVoice;
    }
    utterance.lang = selectedVoice?.lang || 'pt-BR';
    utterance.onend = () => {
      setPlayingId(null);
      if (onFinished) onFinished();
    };
    utterance.onerror = () => {
      setPlayingId(null);
      if (onFinished) onFinished();
    };
    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const playSingleComment = async (comment: Comment, onFinished?: () => void) => {
    stopAudio();
    setPlayingId(comment.id);

    const cleanBody = getCleanText(comment.text);
    const quoteText = highlights.find(h => h.id === comment.highlightId)?.text;
    const fullTextToRead = quoteText 
      ? `Citação: "${quoteText}". Anotação: ${cleanBody}` 
      : cleanBody;

    if (!fullTextToRead.trim()) {
      setPlayingId(null);
      if (onFinished) onFinished();
      return;
    }

    if (selectedVoice?.isElevenLabs || selectedVoice?.provider === 'elevenlabs') {
      try {
        const response = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullTextToRead, voiceId: selectedVoice.id }),
        });

        if (!response.ok) throw new Error('ElevenLabs TTS failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          setPlayingId(null);
          if (onFinished) onFinished();
        };
        await audioRef.current.play();
        return;
      } catch (err) {
        console.error('Note ElevenLabs playback error:', err);
        fallbackSpeechSynthesis(fullTextToRead, onFinished);
        return;
      }
    }

    if (selectedVoice?.isOpenAI) {
      try {
        const response = await fetch('/api/openai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullTextToRead }),
        });

        if (!response.ok) throw new Error('OpenAI TTS failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          setPlayingId(null);
          if (onFinished) onFinished();
        };
        await audioRef.current.play();
      } catch (err) {
        console.error('Note TTS playback error:', err);
        fallbackSpeechSynthesis(fullTextToRead, onFinished);
      }
    } else {
      fallbackSpeechSynthesis(fullTextToRead, onFinished);
    }
  };

  const handlePlayToggle = (comment: Comment) => {
    if (playingId === comment.id) {
      stopAudio();
    } else {
      playSingleComment(comment);
    }
  };

  const handlePlayAll = () => {
    if (isPlayingAll || playingId !== null) {
      stopAudio();
      return;
    }

    if (comments.length === 0) return;
    setIsPlayingAll(true);

    let index = 0;
    const playNext = () => {
      if (index >= comments.length) {
        setIsPlayingAll(false);
        setPlayingId(null);
        return;
      }
      const curComment = comments[index];
      index++;
      playSingleComment(curComment, playNext);
    };

    playNext();
  };

  const getHighlightText = (highlightId: string) => {
    const text = highlights.find(h => h.id === highlightId)?.text || '';
    return text.length > 60 ? text.substring(0, 60) + '...' : text;
  };

  const scrollToHighlight = (highlightId: string) => {
    if (!highlightId) return;
    document.getElementById(highlightId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (window.innerWidth < 768) {
      onToggle();
    }
  };

  const hasComments = comments.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed md:relative top-0 right-0 h-full w-84 md:w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-50 md:z-40 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
                <MessageSquare size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Anotações & Notas</h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{comments.length} item{comments.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {hasComments && (
                <button
                  onClick={handlePlayAll}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    isPlayingAll 
                      ? 'bg-red-500 text-white shadow-sm hover:bg-red-600 animate-pulse' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                  }`}
                  title={isPlayingAll ? "Parar leitura de todas as notas" : "Ouvir todas as notas"}
                >
                  {isPlayingAll ? <Square size={12} /> : <Volume2 size={13} />}
                  <span>{isPlayingAll ? 'Parar' : 'Ouvir Tudo'}</span>
                </button>
              )}
              <button onClick={onToggle} className="icon-btn !p-1.5 ml-1" title="Fechar barra lateral">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* List of comments / notes */}
          <div className="flex-grow overflow-y-auto p-5 space-y-4">
            {hasComments ? (
              <div className="space-y-4">
                {comments.map((comment) => {
                  const isPlayingThis = playingId === comment.id;
                  const isEditing = editingId === comment.id;
                  const isAiNote = comment.id.startsWith('notes-') || comment.text.includes('<h2') || comment.text.includes('<ul');
                  const quoteText = getHighlightText(comment.highlightId);

                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={comment.id} 
                      className={`group relative p-4 rounded-2xl border transition-all ${
                        isPlayingThis 
                          ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 shadow-md ring-2 ring-blue-500/20' 
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs'
                      }`}
                    >
                      {/* Top Action Bar */}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5">
                          {isAiNote ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                              <Sparkles size={10} />
                              Nota IA
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              Comentário
                            </span>
                          )}

                          {isPlayingThis && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                              <Volume2 size={12} />
                              Lendo...
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Play Aloud Button */}
                          <button
                            onClick={() => handlePlayToggle(comment)}
                            className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                              isPlayingThis
                                ? 'bg-red-500 text-white hover:bg-red-600 shadow-xs'
                                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                            }`}
                            title={isPlayingThis ? "Parar leitura" : "Ouvir nota em voz alta"}
                          >
                            {isPlayingThis ? <Square size={13} /> : <Play size={13} fill="currentColor" />}
                          </button>

                          {/* Edit Button */}
                          {!isEditing && (
                            <button
                              onClick={() => handleStartEdit(comment)}
                              className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              title="Editar anotação"
                            >
                              <Pencil size={13} />
                            </button>
                          )}

                          {/* Delete Button */}
                          <button
                            onClick={() => {
                              if (playingId === comment.id) stopAudio();
                              onDeleteComment(comment.id);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="Excluir anotação"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Quoted highlight preview if attached */}
                      {comment.highlightId && quoteText && (
                        <div 
                          className="relative mb-3 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                          onClick={() => scrollToHighlight(comment.highlightId)}
                          title="Clique para localizar no documento"
                        >
                          <Quote size={12} className="text-amber-500 mb-1" />
                          <p className="text-xs italic text-amber-900 dark:text-amber-200 line-clamp-2">
                            "{quoteText}"
                          </p>
                        </div>
                      )}
                      
                      {/* Note Content or Edit Form */}
                      {isEditing ? (
                        <div className="space-y-2 mt-2">
                          <textarea
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full p-2.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-blue-400 dark:border-blue-600 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none resize-y min-h-[70px] leading-relaxed"
                            placeholder="Edite seu comentário..."
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={handleCancelEdit}
                              className="px-2.5 py-1 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleSaveEdit(comment.id)}
                              className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-xs"
                            >
                              <Check size={13} />
                              <span>Salvar</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed overflow-hidden">
                          {isAiNote ? (
                            <div 
                              className="prose dark:prose-invert prose-xs max-w-none text-xs space-y-2 [&>h2]:text-sm [&>h2]:font-bold [&>h2]:mt-2 [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:space-y-1 [&>p]:mb-2"
                              dangerouslySetInnerHTML={{ __html: comment.text }}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{comment.text}</p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                  <MessageSquare size={36} strokeWidth={1.5} />
                </div>
                <div className="space-y-1 max-w-[200px]">
                  <p className="font-semibold text-sm text-zinc-700 dark:text-zinc-300">Nenhuma anotação ainda</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Selecione trechos no documento para destacar, adicionar comentários ou gerar notas de estudo com IA.</p>
                </div>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
