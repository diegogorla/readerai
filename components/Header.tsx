import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, Square, Mic, FileText, Link, 
  Languages, ZoomIn, ZoomOut, Highlighter, 
  MessageSquare, Download, ChevronRight, ChevronLeft, ChevronDown,
  Settings, X, Upload, Sparkles, HardDrive, Edit3, Undo2,
  ListTodo, AudioLines, Bell, Check
} from 'lucide-react';
import { ExportFormat, TTSState, RecognitionState, Voice, HighlightColor } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../lib/firebase';
import { getVoiceLanguageCodes } from '../services/voices';

const HIGHLIGHT_COLOR_OPTIONS: { id: HighlightColor; label: string; dot: string; activeBg: string }[] = [
  { id: 'yellow', label: 'Amarelo', dot: '#facc15', activeBg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/25 dark:text-yellow-300 ring-1 ring-yellow-400/60' },
  { id: 'green', label: 'Verde', dot: '#4ade80', activeBg: 'bg-green-100 text-green-800 dark:bg-green-500/25 dark:text-green-300 ring-1 ring-green-400/60' },
  { id: 'blue', label: 'Azul', dot: '#38bdf8', activeBg: 'bg-sky-100 text-sky-800 dark:bg-sky-500/25 dark:text-sky-300 ring-1 ring-sky-400/60' },
  { id: 'pink', label: 'Rosa', dot: '#f472b6', activeBg: 'bg-pink-100 text-pink-800 dark:bg-pink-500/25 dark:text-pink-300 ring-1 ring-pink-400/60' },
  { id: 'purple', label: 'Roxo', dot: '#c084fc', activeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-500/25 dark:text-purple-300 ring-1 ring-purple-400/60' },
  { id: 'orange', label: 'Laranja', dot: '#fb923c', activeBg: 'bg-orange-100 text-orange-800 dark:bg-orange-500/25 dark:text-orange-300 ring-1 ring-orange-400/60' },
];

interface HeaderProps {
  onUpgrade?: () => void;
  onFileUpload: (file: File) => void;
  onUrlSubmit: (url: string) => void;
  onOpenUrl?: () => void;
  onOpenGoogleDrive: () => void;
  onOpenDirectText: () => void;
  onOpenVoiceGallery: () => void;
  onZoom: (direction: 'in' | 'out') => void;
  onToggleHighlightMode: () => void;
  onHighlightText?: () => void;
  highlightColor?: HighlightColor;
  onSetHighlightColor?: (color: HighlightColor) => void;
  onComment: () => void;
  onTranslate: (targetLanguage?: string) => void;
  onGenerateNotes: () => void;
  onExport: (format: ExportFormat) => void;
  onToggleSidebar: () => void;
  onUndoHighlight?: () => void;
  onOpenSmartList?: () => void;
  onOpenTranscribe?: () => void;
  onOpenAuth?: () => void;
  selectionActive: boolean;
  isContentEditable: boolean;
  isHighlightMode: boolean;
  openDocsCount?: number;
  
  ttsState: TTSState;
  recognitionState: RecognitionState;
  onSetVoice: (voice: Voice) => void;
  onSetRate: (rate: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleListen: () => void;
  onNextSentence: () => void;
  onPreviousSentence: () => void;
  onOpenSubscription?: (reason?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onFileUpload, onUrlSubmit, onOpenUrl, onOpenGoogleDrive, onOpenDirectText, onOpenVoiceGallery, onZoom, onToggleHighlightMode, onHighlightText, highlightColor = 'yellow', onSetHighlightColor, onComment, onTranslate, onGenerateNotes, onExport, onToggleSidebar, onUndoHighlight, onOpenSmartList, onOpenTranscribe, onOpenAuth, selectionActive, isContentEditable, isHighlightMode, openDocsCount = 0,
  ttsState, recognitionState, onSetVoice, onSetRate, onPlay, onPause, onStop, onToggleListen, onNextSentence, onPreviousSentence, onOpenSubscription
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { user, userData } = useAuth();
  const [translateOpen, setTranslateOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 64, left: 16 });
  const [url, setUrl] = useState('https://');
  const [isUrlInputVisible, setIsUrlInputVisible] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const translateRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const activeColorMeta = HIGHLIGHT_COLOR_OPTIONS.find(c => c.id === highlightColor) || HIGHLIGHT_COLOR_OPTIONS[0];

  const computePopoverPos = (el: HTMLElement | null, width: number) => {
    if (!el) return { top: 64, left: 16 };
    const rect = el.getBoundingClientRect();
    const clampedLeft = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    return { top: rect.bottom + 8, left: clampedLeft };
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
      if (translateRef.current && !translateRef.current.contains(event.target as Node)) {
        setTranslateOpen(false);
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      let finalUrl = url.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }
      onUrlSubmit(finalUrl);
      setIsUrlInputVisible(false);
      setUrl('');
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full px-2 md:px-4 pt-14 pb-2 md:pt-4 md:pb-3 glass-panel border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-3 shadow-sm bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-3">
        
        {/* TOP TIER: Tools */}
        <div className="flex items-center gap-1 w-full overflow-x-auto scrollbar-hide">
          <div className="flex items-center shrink-0" ref={colorPickerRef}>
            <button 
              onClick={() => {
                if (selectionActive && onHighlightText) {
                  onHighlightText();
                } else {
                  onToggleHighlightMode();
                }
              }} 
              onMouseDown={(e) => e.preventDefault()}
              className={`icon-btn justify-center relative flex flex-col items-center gap-0.5 ${isHighlightMode ? activeColorMeta.activeBg + ' font-semibold' : ''}`} 
              title={selectionActive ? `Destacar texto selecionado (${activeColorMeta.label})` : (isHighlightMode ? `Modo Destaque ATIVADO (${activeColorMeta.label})` : `Modo Destaque (${activeColorMeta.label})`)}
            >
              <Highlighter size={19} />
              <span
                className="w-4 h-1 rounded-full block"
                style={{ backgroundColor: activeColorMeta.dot }}
              />
            </button>

            {onSetHighlightColor && (
              <button
                type="button"
                onClick={(e) => {
                  const next = !colorPickerOpen;
                  if (next) {
                    setPopoverPos(computePopoverPos(e.currentTarget, 224));
                    setTranslateOpen(false);
                    setExportOpen(false);
                  }
                  setColorPickerOpen(next);
                }}
                onMouseDown={(e) => e.preventDefault()}
                className="icon-btn !px-1 !py-1.5 -ml-0.5 shrink-0 flex items-center gap-0.5"
                title="Alterar cor da caneta marcadora"
              >
                <span
                  className="w-3 h-3 rounded-full border border-zinc-400/60 dark:border-zinc-500 shadow-xs"
                  style={{ backgroundColor: activeColorMeta.dot }}
                />
                <ChevronDown size={12} className="text-zinc-400" />
              </button>
            )}

            <AnimatePresence>
              {colorPickerOpen && onSetHighlightColor && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  style={{ top: popoverPos.top, left: popoverPos.left }}
                  className="fixed w-56 p-2.5 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 z-[90]"
                >
                  <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Cor da Caneta Marcadora
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {HIGHLIGHT_COLOR_OPTIONS.map((opt) => {
                      const isSelected = highlightColor === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onSetHighlightColor(opt.id);
                            setColorPickerOpen(false);
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                            isSelected
                              ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                              : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center border border-black/15"
                            style={{ backgroundColor: opt.dot }}
                          >
                            {isSelected && <Check size={10} className="text-zinc-950 stroke-[3]" />}
                          </span>
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {onUndoHighlight && (
            <button 
              onClick={onUndoHighlight}
              onMouseDown={(e) => e.preventDefault()}
              className="icon-btn !p-1.5 shrink-0 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400"
              title="Desfazer último destaque"
            >
              <Undo2 size={16} />
            </button>
          )}

          <button 
            onClick={onComment} 
            onMouseDown={(e) => e.preventDefault()}
            disabled={!isContentEditable || !selectionActive} 
            className={`icon-btn flex-1 md:flex-none justify-center ${selectionActive ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : ''}`} 
            title={selectionActive ? "Anotar no texto selecionado" : "Adicionar anotação"}
          >
            <MessageSquare size={19} />
          </button>

          <div className="relative flex-1 md:flex-none flex justify-center" ref={translateRef}>
            <button 
              disabled={!isContentEditable}
              onClick={(e) => {
                const next = !translateOpen;
                if (next) {
                  setPopoverPos(computePopoverPos(e.currentTarget, 224));
                  setColorPickerOpen(false);
                  setExportOpen(false);
                }
                setTranslateOpen(next);
              }}
              onMouseDown={(e) => e.preventDefault()}
              className={`icon-btn w-full justify-center ${
                translateOpen || selectionActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : ''
              }`}
              title={selectionActive ? "Traduzir trecho selecionado com IA" : "Traduzir documento com IA"}
            >
              <Languages size={19} />
            </button>
            <AnimatePresence>
              {translateOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  style={{ top: popoverPos.top, left: popoverPos.left }}
                  className="fixed w-56 p-1.5 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 z-[90]"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {selectionActive ? 'Traduzir trecho selecionado' : 'Traduzir documento para'}
                  </div>
                  {[
                    { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
                    { code: 'en', name: 'English (US)', flag: '🇺🇸' },
                    { code: 'es', name: 'Español', flag: '🇪🇸' },
                    { code: 'fr', name: 'Français', flag: '🇫🇷' },
                    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
                    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setTranslateOpen(false);
                        onTranslate(lang.code);
                      }}
                      className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={onGenerateNotes}
            onMouseDown={(e) => e.preventDefault()}
            disabled={!isContentEditable}
            className="icon-btn flex-1 md:flex-none justify-center text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
            title={selectionActive ? "Gerar Notas e Resumo do trecho selecionado com IA" : "Gerar Notas e Resumo do documento com IA"}
          >
            <Sparkles size={19} />
          </button>

          <div className="relative flex-1 md:flex-none flex justify-center" ref={exportRef}>
            <button
              disabled={!isContentEditable}
              onClick={(e) => {
                const next = !exportOpen;
                if (next) {
                  setPopoverPos(computePopoverPos(e.currentTarget, 160));
                  setTranslateOpen(false);
                  setColorPickerOpen(false);
                }
                setExportOpen(next);
              }}
              onMouseDown={(e) => e.preventDefault()}
              className="icon-btn w-full justify-center"
              title="Exportar Documento"
            >
              <Download size={19} />
            </button>
            <AnimatePresence>
              {exportOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  style={{ top: popoverPos.top, left: popoverPos.left }}
                  className="fixed w-40 p-1 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 z-[90]"
                >
                  {(['pdf', 'docx', 'txt'] as ExportFormat[]).map(format => (
                    <button 
                      key={format} 
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onExport(format); setExportOpen(false); }} 
                      className="flex items-center w-full px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <FileText size={16} className="mr-2" />
                      {format.toUpperCase()}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={onToggleSidebar}
            onMouseDown={(e) => e.preventDefault()}
            className="icon-btn flex-1 md:flex-none justify-center md:hidden" title="Ver Anotações">
            <MessageSquare size={19} />
          </button>

          {/* SMART LIST & TRANSCRIBE BUTTONS */}
          {onOpenSmartList && (
            <button
              onClick={onOpenSmartList}
              onMouseDown={(e) => e.preventDefault()}
              className="icon-btn flex-1 md:flex-none justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 relative"
              title="Minha Lista de Itens & Alarmes"
            >
              <ListTodo size={19} />
              <span className="hidden lg:inline text-xs font-semibold ml-1">Minha Lista</span>
            </button>
          )}

          {onOpenTranscribe && (
            <button
              onClick={onOpenTranscribe}
              onMouseDown={(e) => e.preventDefault()}
              className="icon-btn flex-1 md:flex-none justify-center text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              title="Transcrever Áudio com IA (Gemini & Whisper)"
            >
              <AudioLines size={19} />
              <span className="hidden lg:inline text-xs font-semibold ml-1">Transcrever</span>
            </button>
          )}

          {/* USER AUTH */}
          <div className="flex items-center gap-2 shrink-0 ml-auto border-l border-zinc-200/50 dark:border-zinc-800/50 pl-3">
            {user ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onOpenSubscription && onOpenSubscription()}
                  onMouseDown={(e) => e.preventDefault()}
                  className={`hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    userData?.plan === 'pro'
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/40'
                      : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/50'
                  }`}
                >
                  {userData?.plan === 'pro' ? <><Sparkles size={14}/> Pro</> : 'Fazer Upgrade'}
                </button>
                <button
                  onClick={onOpenAuth || logout}
                  onMouseDown={(e) => e.preventDefault()}
                  title="Conta Google"
                  className="flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 py-1 px-2 rounded-xl transition-colors"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Avatar"
                      className="w-7 h-7 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hidden sm:block truncate max-w-[100px]">{user.displayName || user.email}</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={onOpenAuth}
                onMouseDown={(e) => e.preventDefault()}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>Entrar com Google</span>
              </button>
            )}
          </div>
        </div>

        {/* MIDDLE TIER: File Inputs & Playback */}
        <div className="flex items-center justify-between gap-1.5 w-full overflow-x-auto scrollbar-hide py-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => fileInputRef.current?.click()}
            onMouseDown={(e) => e.preventDefault()}
            className="icon-btn flex-1 md:flex-none justify-center" title="Abrir arquivo local">
              <Upload size={19} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.docx,.txt,.html" />

            <button onClick={onOpenDirectText}
            onMouseDown={(e) => e.preventDefault()}
            className="icon-btn flex-1 md:flex-none justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Escrever ou Colar Texto">
              <Edit3 size={19} />
            </button>

            <button onClick={onOpenGoogleDrive}
            onMouseDown={(e) => e.preventDefault()}
            className="icon-btn flex-1 md:flex-none justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Google Drive">
              <HardDrive size={19} />
            </button>

            <div className="relative flex-1 md:flex-none flex justify-center">
              <button 
                onClick={() => {
                  if (onOpenUrl) {
                    onOpenUrl();
                  } else {
                    setIsUrlInputVisible(!isUrlInputVisible);
                  }
                }}
                onMouseDown={(e) => e.preventDefault()}
                className={`icon-btn w-full justify-center ${isUrlInputVisible ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                title="Ler a partir de uma URL"
              >
                <Link size={19} />
              </button>
              <AnimatePresence>
                {isUrlInputVisible && (
                  <>
                    <div 
                      className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-xs" 
                      onClick={() => setIsUrlInputVisible(false)} 
                    />
                    <motion.form 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      onSubmit={handleUrlSubmit}
                      className="fixed top-28 left-1/2 -translate-x-1/2 w-[92%] max-w-md p-3.5 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-2.5 z-[100]"
                    >
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <Link size={14} className="text-blue-600 dark:text-blue-400" />
                          <span>Abrir e Ler Artigo da Web</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsUrlInputVisible(false)}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input 
                          autoFocus
                          type="text"
                          inputMode="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="Cole qualquer link (ex: wikipedia.org ou g1.globo.com)..."
                          className="flex-grow bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                          required
                        />
                        <button type="submit" className="btn-primary !px-3.5 !py-2 text-xs font-semibold shrink-0 flex items-center gap-1">
                          <span>Abrir</span>
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </motion.form>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Center Playback Controls */}
          <div className="flex items-center justify-center flex-1 md:flex-none">
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 shrink-0">
              <button onClick={onPreviousSentence} onMouseDown={e => e.preventDefault()} onTouchStart={e => e.preventDefault()} className="icon-btn !p-1.5 shrink-0" title="Frase anterior"><ChevronLeft size={18} /></button>
              
              {ttsState.isSpeaking ? (
                <button onClick={onPause} onMouseDown={e => e.preventDefault()} onTouchStart={e => e.preventDefault()} className="icon-btn !p-2 bg-zinc-200 dark:bg-zinc-700 shrink-0 text-blue-600 dark:text-blue-400" title="Pausar"><Pause size={20} fill="currentColor" /></button>
              ) : (
                <button onClick={onPlay}
            onMouseDown={(e) => e.preventDefault()} onTouchStart={e => e.preventDefault()} className="icon-btn !p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 shrink-0 text-blue-600 dark:text-blue-400" title="Iniciar Leitura"><Play size={20} fill="currentColor" /></button>
              )}
              
              <button onClick={onNextSentence} onMouseDown={e => e.preventDefault()} onTouchStart={e => e.preventDefault()} className="icon-btn !p-1.5 shrink-0" title="Próxima frase"><ChevronRight size={18} /></button>
              <button onClick={onStop} onMouseDown={e => e.preventDefault()} onTouchStart={e => e.preventDefault()} className="icon-btn !p-1.5 shrink-0" title="Parar reprodução"><Square size={18} fill="currentColor" /></button>
            </div>
          </div>

          <button 
            onClick={onToggleListen}
            onMouseDown={(e) => e.preventDefault()}
            className={`icon-btn !p-2 shrink-0 md:ml-2 ${recognitionState.isListening ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
            title="Comandos por voz"
          >
            <Mic size={19} className={recognitionState.isListening ? 'animate-pulse' : ''} />
          </button>
        </div>

        {/* BOTTOM TIER: Voice, Speed, Zoom */}
        <div className="flex items-center justify-between gap-2 w-full overflow-x-auto scrollbar-hide pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
          
          {/* Left: Voice Selection */}
          <div className="flex items-center gap-1 shrink-0">
            <select 
              className="bg-transparent text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold focus:outline-none py-1.5 cursor-pointer max-w-[170px] sm:max-w-[220px] truncate"
              value={ttsState.selectedVoice?.id || ''}
              onChange={(e) => {
                const voice = ttsState.voices.find(v => v.id === e.target.value);
                if (voice) onSetVoice(voice);
              }}
              title="Trocar voz de leitura"
            >
              {(() => {
                const elevenVoices = ttsState.voices.filter(v => v.isElevenLabs || v.provider === 'elevenlabs');
                const ptVoices = ttsState.voices.filter(v => !elevenVoices.includes(v) && (getVoiceLanguageCodes(v).includes('pt') || v.primaryLang === 'pt' || (v.accent || '').toLowerCase().includes('brazil')));
                const enVoices = ttsState.voices.filter(v => !elevenVoices.includes(v) && !ptVoices.includes(v) && (getVoiceLanguageCodes(v).includes('en') || v.primaryLang === 'en'));
                const otherVoices = ttsState.voices.filter(v => !elevenVoices.includes(v) && !ptVoices.includes(v) && !enVoices.includes(v));

                const renderOption = (voice: Voice) => {
                  const cleanName = voice.name.replace(/OpenAI: /g, '').split(' - ')[0].trim();
                  const genderTag = voice.gender === 'male' ? '♂ ' : voice.gender === 'female' ? '♀ ' : '';
                  const isDgorla = voice.id === 'QeklSZR6uyDJECk01m3i' || voice.name.toLowerCase().includes('dgorla');
                  const isEleven = voice.isElevenLabs || voice.provider === 'elevenlabs';
                  const provTag = isDgorla ? '👑 ' : isEleven ? '🎙️ ' : (voice.isMicrosoft || voice.id === 'ms-antonio-neural') ? '🇧🇷 ' : voice.isGemini ? '✨ ' : voice.isOpenAI ? '🤖 ' : '';
                  return (
                    <option key={voice.id} value={voice.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 py-1">
                      {provTag}{genderTag}{cleanName}
                    </option>
                  );
                };

                return (
                  <>
                    {elevenVoices.length > 0 && (
                      <optgroup label="👑 ElevenLabs (Dgorla & Vozes Clonadas)">
                        {elevenVoices.map(renderOption)}
                      </optgroup>
                    )}
                    {ptVoices.length > 0 && (
                      <optgroup label="🇧🇷 Português (Antonio & Gemini)">
                        {ptVoices.map(renderOption)}
                      </optgroup>
                    )}
                    {enVoices.length > 0 && (
                      <optgroup label="🇺🇸 English (OpenAI & Gemini)">
                        {enVoices.map(renderOption)}
                      </optgroup>
                    )}
                    {otherVoices.length > 0 && (
                      <optgroup label="🌍 Outros Idiomas">
                        {otherVoices.map(renderOption)}
                      </optgroup>
                    )}
                  </>
                );
              })()}
            </select>

            <button
              onClick={onOpenVoiceGallery}
              onMouseDown={(e) => e.preventDefault()}
              className="icon-btn !p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 shrink-0"
              title="Galeria de Vozes & Idiomas (Gemini, Antonio, OpenAI)"
            >
              <Sparkles size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* Speed Selector */}
            <div className="flex items-center gap-1" title="Velocidade de leitura">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase hidden sm:inline-block">Velocidade</span>
              <select 
                value={ttsState.rate || 1} 
                onChange={(e) => onSetRate(parseFloat(e.target.value))}
                className="bg-transparent text-zinc-700 dark:text-zinc-300 text-xs font-bold focus:outline-none cursor-pointer p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <option value="0.5">0.5x</option>
                <option value="0.8">0.8x</option>
                <option value="1">1.0x</option>
                <option value="1.2">1.2x</option>
                <option value="1.5">1.5x</option>
              </select>
            </div>

            <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 shrink-0" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => onZoom('out')}
            onMouseDown={(e) => e.preventDefault()}
            className="icon-btn !p-1.5" title="Diminuir Zoom"><ZoomOut size={16} /></button>
              <button onClick={() => onZoom('in')}
            onMouseDown={(e) => e.preventDefault()}
            className="icon-btn !p-1.5" title="Aumentar Zoom"><ZoomIn size={16} /></button>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
