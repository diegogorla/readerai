import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Globe, Edit3, ChevronDown, ChevronUp, 
  X, Volume2, Highlighter, MessageSquare, Maximize2, Minimize2, Play
} from 'lucide-react';
import { OpenDocument, Highlight, Comment } from '../types';
import { ContentDisplay } from './ContentDisplay';

interface SelectionInfo {
  text: string;
  range: Range;
  position: { top: number; left: number };
}

interface DocumentPanelProps {
  document: OpenDocument;
  isActive: boolean;
  isSpeaking: boolean;
  zoom: number;
  isHighlightMode: boolean;
  onFocus: (docId: string) => void;
  onToggleMinimize: (docId: string) => void;
  onClose: (docId: string) => void;
  onSelectionChange: (docId: string, hasSelection: boolean, selectionInfo?: SelectionInfo | null) => void;
  onHighlightText: (docId: string, customRange?: Range, customText?: string) => void;
  onAddNoteFromSelection: (docId: string, selectionInfo?: SelectionInfo | null) => void;
  onPlayFromSelection: (docId: string, targetNode: Node, selectedText?: string) => void;
  onPlayDocument: (docId: string) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  selectionInfo?: SelectionInfo | null;
}

export const DocumentPanel: React.FC<DocumentPanelProps> = ({
  document,
  isActive,
  isSpeaking,
  zoom,
  isHighlightMode,
  onFocus,
  onToggleMinimize,
  onClose,
  onSelectionChange,
  onHighlightText,
  onAddNoteFromSelection,
  onPlayFromSelection,
  onPlayDocument,
  contentRef,
  selectionInfo,
}) => {
  const getDocIcon = () => {
    switch (document.type) {
      case 'url':
        return <Globe size={16} className="text-cyan-500 shrink-0" />;
      case 'direct_text':
        return <Edit3 size={16} className="text-emerald-500 shrink-0" />;
      default:
        return <FileText size={16} className="text-blue-500 shrink-0" />;
    }
  };

  const isCurrentlySpeakingThis = isActive && isSpeaking;

  const handleSelectionChange = React.useCallback((hasSel: boolean, sInfo?: SelectionInfo | null) => {
    onSelectionChange(document.id, hasSel, sInfo);
  }, [document.id, onSelectionChange]);

  const handleHighlightText = React.useCallback((cRange?: Range, cText?: string) => {
    onHighlightText(document.id, cRange, cText);
  }, [document.id, onHighlightText]);

  const handleAddNoteFromSelection = React.useCallback((sInfo?: SelectionInfo | null) => {
    onAddNoteFromSelection(document.id, sInfo);
  }, [document.id, onAddNoteFromSelection]);

  const handlePlayFromSelection = React.useCallback((tNode: Node, sText?: string) => {
    onPlayFromSelection(document.id, tNode, sText);
  }, [document.id, onPlayFromSelection]);

  return (
    <div 
      className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm flex flex-col h-full flex-grow ${
        isActive 
          ? 'border-blue-300 dark:border-blue-700/80 bg-white dark:bg-zinc-900 ring-2 ring-blue-500/20 shadow-md' 
          : 'border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:border-zinc-300 dark:hover:border-zinc-700'
      }`}
      onClick={() => {
        if (!isActive) onFocus(document.id);
      }}
    >
      {/* Title Bar */}
      <div className={`px-4 py-3 flex items-center justify-between gap-3 select-none cursor-pointer border-b transition-colors ${
        isActive 
          ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40' 
          : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/70'
      }`}>
        {/* Left: Icon, Title, Active/Speaking Badge */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-1 rounded-lg bg-white dark:bg-zinc-800 shadow-xs border border-zinc-200/60 dark:border-zinc-700/60">
            {getDocIcon()}
          </div>
          
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <h3 
              className="text-xs md:text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate"
              title={document.title}
            >
              {document.title}
            </h3>

            {isCurrentlySpeakingThis ? (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white animate-pulse">
                <Volume2 size={11} />
                Lendo
              </span>
            ) : isActive ? (
              <span className="hidden sm:inline-flex shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                Ativo
              </span>
            ) : null}

            {/* Highlights and comments badge count */}
            {(document.highlights.length > 0 || document.comments.length > 0) && (
              <div className="hidden md:flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                {document.highlights.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Highlighter size={10} className="text-amber-500" />
                    {document.highlights.length}
                  </span>
                )}
                {document.comments.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <MessageSquare size={10} className="text-blue-500" />
                    {document.comments.length}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions (Play, Minimize/Maximize, Close) */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Quick Play document button */}
          {!isCurrentlySpeakingThis && (
            <button
              onClick={() => {
                onFocus(document.id);
                onPlayDocument(document.id);
              }}
              className="p-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100/70 dark:hover:bg-blue-900/40 transition-colors"
              title="Ouvir este documento do início"
            >
              <Play size={14} fill="currentColor" />
            </button>
          )}

          {/* Minimize / Expand Toggle */}
          <button
            onClick={() => onToggleMinimize(document.id)}
            className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors"
            title={document.isMinimized ? "Expandir documento" : "Minimizar documento"}
          >
            {document.isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>

          {/* Close Document Button */}
          <button
            onClick={() => onClose(document.id)}
            className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            title="Fechar este documento"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Document Content Area (Visible when not minimized) */}
      <AnimatePresence>
        {!document.isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full relative flex flex-col overflow-hidden flex-grow max-h-none"
          >
            <ContentDisplay
              content={document.content}
              contentType={document.contentType}
              sourceUrl={document.sourceUrl || ''}
              zoom={zoom}
              isHighlightMode={isHighlightMode && isActive}
              onSelectionChange={handleSelectionChange}
              onHighlightText={handleHighlightText}
              onAddNoteFromSelection={handleAddNoteFromSelection}
              onPlayFromSelection={handlePlayFromSelection}
              contentRef={contentRef}
              selectionInfo={isActive ? selectionInfo : null}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
