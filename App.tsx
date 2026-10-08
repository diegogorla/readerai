import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FileText, Globe, Sparkles, HardDrive, Edit3, AlertCircle, X, Plus, Compass } from 'lucide-react';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { DocumentPanel } from './components/DocumentPanel';
import { CommentSidebar } from './components/CommentSidebar';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { VoiceSelectorModal } from './components/VoiceSelectorModal';
import { AddNoteModal } from './components/AddNoteModal';
import { DirectTextInputModal } from './components/DirectTextInputModal';
import { UrlInputModal } from './components/UrlInputModal';
import { useSpeech } from './hooks/useSpeech';
import { parseFile, translateContent, exportContent, fetchAndCleanUrl, generateNotes, checkUsageLimit } from './services/api';
import type { Highlight, Comment, ExportFormat, OpenDocument } from './types';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SubscriptionModal } from './components/SubscriptionModal';
import { AuthModal } from './components/AuthModal';
import { SmartListPanel } from './components/SmartListPanel';
import { TranscribeModal } from './components/TranscribeModal';

interface SelectionInfo {
  text: string;
  range: Range;
  position: { top: number; left: number };
}



function App() {
  const { user, userData, loading } = useAuth();


  const MAX_DOCUMENTS = userData?.plan === 'pro' ? 3 : 1;
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  
  const [zoom, setZoom] = useState(100);
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  
  // Modals state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteQuotedText, setNoteQuotedText] = useState('');
  const [noteHighlightId, setNoteHighlightId] = useState('');
  const [noteTargetDocId, setNoteTargetDocId] = useState<string | null>(null);

  const [isDirectTextModalOpen, setIsDirectTextModalOpen] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscriptionReason, setSubscriptionReason] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSmartListOpen, setIsSmartListOpen] = useState(false);
  const [isTranscribeModalOpen, setIsTranscribeModalOpen] = useState(false);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [isVoiceGalleryOpen, setIsVoiceGalleryOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleOpenSubscription = (reason?: string) => {
    setSubscriptionReason(reason || null);
    setSubscriptionOpen(true);
  };
  
  const activeContentRef = useRef<HTMLDivElement | null>(null);

  // Active document helper
  const activeDocument = documents.find(d => d.id === activeDocumentId) || (documents.length > 0 ? documents[0] : null);

  const { 
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
    speakStandalone
  } = useSpeech(activeContentRef, activeDocument?.content || '');

  // Helper to show limit warning
  const showLimitNotice = () => {
    setLimitWarning(`Limite de ${MAX_DOCUMENTS} documentos simultâneos atingido. Feche um dos documentos abertos para adicionar outro.`);
    setTimeout(() => {
      setLimitWarning(null);
    }, 5000);
  };

  // Add document to list (up to 3)
  const addDocument = useCallback((doc: Omit<OpenDocument, 'id' | 'createdAt' | 'isMinimized' | 'highlights' | 'comments'> & { highlights?: Highlight[]; comments?: Comment[] }) => {
    if (documents.length >= MAX_DOCUMENTS) {
      showLimitNotice();
      return false;
    }

    const newDocId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newDoc: OpenDocument = {
      id: newDocId,
      title: doc.title || doc.filename,
      filename: doc.filename,
      content: doc.content,
      originalContent: doc.originalContent || doc.content,
      contentType: doc.contentType || 'html',
      sourceUrl: doc.sourceUrl,
      type: doc.type || 'file',
      highlights: doc.highlights || [],
      comments: doc.comments || [],
      isMinimized: false,
      createdAt: Date.now(),
    };

    setDocuments(prev => [...prev, newDoc]);
    setActiveDocumentId(newDocId);
    setSelectionInfo(null);
    setSelectionActive(false);
    return true;
  }, [documents.length]);

  const handleFileUpload = useCallback(async (file: File) => {
    try { await checkUsageLimit('file'); } catch (e: any) { setLimitWarning(e.message); return; }
    if (documents.length >= MAX_DOCUMENTS) {
      showLimitNotice();
      return;
    }

    setIsLoading(true);
    handleStop();
    try {
      const { content } = await parseFile(file);
      addDocument({
        title: file.name,
        filename: file.name,
        content,
        originalContent: content,
        contentType: 'html',
        type: 'file',
      });
    } catch (error) {
      console.error("Error parsing file:", error);
      setLimitWarning("Erro ao processar arquivo: " + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [documents.length, handleStop, addDocument]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    try { await checkUsageLimit('url'); } catch (e: any) { setLimitWarning(e.message); return; }
    if (documents.length >= MAX_DOCUMENTS) {
      showLimitNotice();
      return;
    }

    setIsLoading(true);
    handleStop();
    try {
      let targetUrl = url.trim();
      targetUrl = targetUrl.replace(/^(?:https?:\/\/)+/i, 'https://');
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      const { content, title } = await fetchAndCleanUrl(targetUrl);
      addDocument({
        title: title || targetUrl,
        filename: title || targetUrl,
        content,
        originalContent: content,
        contentType: 'html',
        sourceUrl: targetUrl,
        type: 'url',
      });
    } catch (error) {
      console.error("Error fetching URL content:", error);
      setLimitWarning("Erro ao carregar URL: " + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [documents.length, handleStop, addDocument]);

  const handleDirectTextSubmit = useCallback(async (title: string, text: string) => {
    try { await checkUsageLimit('text'); } catch (e: any) { alert(e.message); return; }
    if (documents.length >= MAX_DOCUMENTS) {
      showLimitNotice();
      return;
    }
    handleStop();
    // Convert newlines to HTML paragraphs for rich display and TTS segmentation
    const formattedHtml = text
      .split('\n\n')
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br/>')}</p>`)
      .join('');

    addDocument({
      title: title || 'Texto Digitado',
      filename: title || 'Texto Digitado',
      content: formattedHtml,
      originalContent: formattedHtml,
      contentType: 'html',
      type: 'direct_text',
    });
  }, [documents.length, handleStop, addDocument]);

  const handleCloseDocument = useCallback((docId: string) => {
    handleStop();
    setDocuments(prev => {
      const remaining = prev.filter(d => d.id !== docId);
      if (activeDocumentId === docId) {
        setActiveDocumentId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
    setSelectionInfo(null);
    setSelectionActive(false);
  }, [activeDocumentId, handleStop]);

  const handleToggleMinimize = useCallback((docId: string) => {
    setDocuments(prev => prev.map(doc => {
      if (doc.id === docId) {
        return { ...doc, isMinimized: !doc.isMinimized };
      }
      return doc;
    }));
  }, []);

  const handleFocusDocument = useCallback((docId: string) => {
    setActiveDocumentId(docId);
    // If it was minimized, expand it
    setDocuments(prev => prev.map(doc => {
      if (doc.id === docId && doc.isMinimized) {
        return { ...doc, isMinimized: false };
      }
      return doc;
    }));
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    setZoom(prev => direction === 'in' ? Math.min(200, prev + 10) : Math.max(50, prev - 10));
  };

  const handleSelectionChange = useCallback((docId: string, hasSelection: boolean, info?: SelectionInfo | null) => {
    if (docId !== activeDocumentId) {
      setActiveDocumentId(docId);
    }
    setSelectionActive(hasSelection);
    setSelectionInfo(info || null);
  }, [activeDocumentId]);
  
  const applyHighlightToRange = useCallback((docId: string, range: Range, text: string, existingId?: string) => {
    const id = existingId || `highlight-${Date.now()}`;
    const container = activeContentRef.current;
    if (!range || !container) return id;

    try {
      if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
        const mark = document.createElement('mark');
        mark.className = 'doc-highlight';
        mark.setAttribute('data-highlight-id', id);
        mark.id = id;
        try {
          range.surroundContents(mark);
        } catch {
          const contents = range.extractContents();
          mark.appendChild(contents);
          range.insertNode(mark);
        }
      } else {
        const mark = document.createElement('mark');
        mark.className = 'doc-highlight';
        mark.setAttribute('data-highlight-id', id);
        mark.id = id;
        try {
          const contents = range.extractContents();
          mark.appendChild(contents);
          range.insertNode(mark);
        } catch {
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
          let currNode: Node | null;
          while ((currNode = walker.nextNode())) {
            if (!currNode.nodeValue?.trim()) continue;
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(currNode);
            if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0 &&
                range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0) {
              const subMark = document.createElement('mark');
              subMark.className = 'doc-highlight';
              subMark.setAttribute('data-highlight-id', id);
              const subRange = document.createRange();
              const startOffset = (currNode === range.startContainer) ? range.startOffset : 0;
              const endOffset = (currNode === range.endContainer) ? range.endOffset : (currNode.nodeValue?.length || 0);
              if (startOffset < endOffset) {
                subRange.setStart(currNode, startOffset);
                subRange.setEnd(currNode, endOffset);
                const subContent = subRange.extractContents();
                subMark.appendChild(subContent);
                subRange.insertNode(subMark);
              }
            }
          }
        }
      }

      // Persist the modified HTML into the document's content state
      const updatedHtml = container.innerHTML;
      setDocuments(prev => prev.map(doc => {
        if (doc.id === docId) {
          return {
            ...doc,
            content: updatedHtml,
            highlights: [...doc.highlights, { id, text }]
          };
        }
        return doc;
      }));
    } catch (err) {
      console.warn("Could not apply highlight:", err);
    }
    return id;
  }, []);

  const handleHighlightText = useCallback((docId: string, customRange?: Range, customText?: string) => {
    let targetRange = customRange || selectionInfo?.range;
    let targetText = customText || selectionInfo?.text;

    if (!targetRange || !targetText) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        targetRange = sel.getRangeAt(0);
        targetText = sel.toString().trim();
      }
    }

    if (targetRange && targetText) {
      applyHighlightToRange(docId, targetRange, targetText);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
      }
      setSelectionInfo(null);
      setSelectionActive(false);
    }
  }, [selectionInfo, applyHighlightToRange]);
  
  const handleToggleHighlightMode = () => {
    setIsHighlightMode(prev => !prev);
  };

  const handleUndoHighlight = useCallback(() => {
    if (!activeDocumentId) return;

    setDocuments(prev => prev.map(doc => {
      if (doc.id !== activeDocumentId) return doc;
      
      if (doc.highlights.length === 0) return doc;

      // Only undo highlights that don't have associated comments
      const highlightsWithComments = new Set(doc.comments.map(c => c.highlightId));
      
      // Find the most recent highlight without a comment
      let highlightToRemove = null;
      for (let i = doc.highlights.length - 1; i >= 0; i--) {
        if (!highlightsWithComments.has(doc.highlights[i].id)) {
          highlightToRemove = doc.highlights[i];
          break;
        }
      }

      if (!highlightToRemove) return doc;

      let updatedContent = doc.content;
      if (activeContentRef.current) {
        const elements = activeContentRef.current.querySelectorAll(`[data-highlight-id="${highlightToRemove.id}"]`);
        elements.forEach(el => {
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) {
              parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
          }
        });
        updatedContent = activeContentRef.current.innerHTML;
      }

      return {
        ...doc,
        content: updatedContent,
        highlights: doc.highlights.filter(h => h.id !== highlightToRemove.id)
      };
    }));
  }, [activeDocumentId]);

  const handleComment = useCallback((docId?: string, targetSelection?: SelectionInfo | null) => {
    const targetId = docId || activeDocumentId;
    if (!targetId) return;

    const selInfo = targetSelection || selectionInfo;
    let text = selInfo?.text || '';
    let range = selInfo?.range;

    if (!text || !range) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
        text = sel.toString().trim();
      }
    }

    let highlightId = '';
    if (range && text) {
      highlightId = applyHighlightToRange(targetId, range, text);
    }

    setNoteQuotedText(text);
    setNoteHighlightId(highlightId);
    setNoteTargetDocId(targetId);
    setIsNoteModalOpen(true);
    setSelectionInfo(null);
    setSelectionActive(false);
  }, [activeDocumentId, selectionInfo, applyHighlightToRange]);

  const handleSaveNote = (noteText: string) => {
    const targetId = noteTargetDocId || activeDocumentId;
    if (!targetId) return;

    const newComment: Comment = {
      id: `comment-${Date.now()}`,
      highlightId: noteHighlightId,
      text: noteText,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setDocuments(prev => prev.map(doc => {
      if (doc.id === targetId) {
        return {
          ...doc,
          comments: [...doc.comments, newComment]
        };
      }
      return doc;
    }));
    setIsSidebarOpen(true);
  };

  const handleEditComment = useCallback((commentId: string, newText: string) => {
    setDocuments(prev => prev.map(doc => {
      const commentIndex = doc.comments.findIndex(c => c.id === commentId);
      if (commentIndex !== -1) {
        const updatedComments = [...doc.comments];
        updatedComments[commentIndex] = {
          ...updatedComments[commentIndex],
          text: newText,
          updatedAt: Date.now(),
        };
        return { ...doc, comments: updatedComments };
      }
      return doc;
    }));
  }, []);

  const handleDeleteComment = (commentId: string) => {
    setDocuments(prev => prev.map(doc => {
      const commentToDelete = doc.comments.find(c => c.id === commentId);
      if (!commentToDelete) return doc;

      let updatedContent = doc.content;
      if (activeContentRef.current && commentToDelete.highlightId && doc.id === activeDocumentId) {
        const elements = activeContentRef.current.querySelectorAll(`[data-highlight-id="${commentToDelete.highlightId}"]`);
        elements.forEach(el => {
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) {
              parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
          }
        });
        updatedContent = activeContentRef.current.innerHTML;
      }

      return {
        ...doc,
        content: updatedContent,
        comments: doc.comments.filter(c => c.id !== commentId),
        highlights: doc.highlights.filter(h => h.id !== commentToDelete.highlightId),
      };
    }));
  };

  const handlePlayFromSelection = useCallback((docId: string, targetNode: Node, selectedText?: string) => {
    if (docId !== activeDocumentId) {
      setActiveDocumentId(docId);
    }
    handlePlayFromNode(targetNode, selectedText);
    setSelectionInfo(null);
    setSelectionActive(false);
  }, [activeDocumentId, handlePlayFromNode]);

  const handlePlayDocument = useCallback((docId: string) => {
    if (docId !== activeDocumentId) {
      setActiveDocumentId(docId);
    }
    // Start playback
    handlePlay();
  }, [activeDocumentId, handlePlay]);

  const handleTranslate = async (targetLanguage: string = 'pt-BR') => {
    if (!activeDocument) {
      alert("Abra ou envie um documento antes de traduzir.");
      return;
    }
    const textToTranslate = activeDocument.content || activeDocument.originalContent;
    if (!textToTranslate) return;

    setIsLoading(true);
    handleStop();
    try {
      const translated = await translateContent(textToTranslate, targetLanguage);
      if (translated) {
        setDocuments(prev => prev.map(doc => {
          if (doc.id === activeDocument.id) {
            return { ...doc, content: translated, originalContent: translated };
          }
          return doc;
        }));
      }
    } catch (error: any) {
      console.error("Translation error:", error);
      alert(error.message || "Falha ao traduzir o conteúdo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNotes = async () => {
    if (!activeDocument) {
      alert("Abra ou envie um documento primeiro.");
      return;
    }
    const textForNotes = activeDocument.content || activeDocument.originalContent;
    if (!textForNotes) return;

    setIsLoading(true);
    try {
      const notes = await generateNotes(textForNotes);
      const notesId = `notes-${Date.now()}`;
      const newComment: Comment = {
        id: notesId,
        highlightId: '',
        text: notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setDocuments(prev => prev.map(doc => {
        if (doc.id === activeDocument.id) {
          return { ...doc, comments: [...doc.comments, newComment] };
        }
        return doc;
      }));
      setIsSidebarOpen(true);
    } catch (error: any) {
      console.error("Notes generation error:", error);
      alert(error.message || "Falha ao gerar notas.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (!activeContentRef.current || !activeDocument) return;
    try {
      const commentsText = activeDocument.comments
        .map(c => `- "${activeDocument.highlights.find(h => h.id === c.highlightId)?.text || ''}": ${c.text}`)
        .join('\n');
      await exportContent(activeContentRef.current, format, activeDocument.title, commentsText);
    } catch (error) {
      console.error("Export error:", error);
      alert("Falha ao exportar documento.");
    }
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };
  
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Collect all comments and highlights from all open documents for sidebar view
  const allComments = activeDocument ? activeDocument.comments : [];
  const allHighlights = activeDocument ? activeDocument.highlights : [];

  if (loading) return <div className="min-h-screen flex items-center justify-center dark:bg-zinc-950 dark:text-white">Carregando...</div>;
  if (!user) {
    return (
      <>
        <LandingPage onOpenAuth={() => setIsAuthModalOpen(true)} />
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </>
    );
  }

  return (
    <div 
      className="flex flex-col h-screen font-sans bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Header
        onFileUpload={handleFileUpload}
        onUrlSubmit={handleUrlSubmit}
        onOpenUrl={() => setIsUrlModalOpen(true)}
        onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
        onOpenDirectText={() => setIsDirectTextModalOpen(true)}
        onOpenVoiceGallery={() => setIsVoiceGalleryOpen(true)}
        onZoom={handleZoom}
        onToggleHighlightMode={handleToggleHighlightMode}
        onHighlightText={() => {
          if (activeDocument) {
            handleHighlightText(activeDocument.id);
          }
        }}
        onComment={() => {
          if (activeDocument) {
            handleComment(activeDocument.id);
          }
        }}
        onTranslate={handleTranslate}
        onGenerateNotes={handleGenerateNotes}
        onExport={handleExport}
        onToggleSidebar={handleToggleSidebar}
        onUndoHighlight={handleUndoHighlight}
        onOpenSmartList={() => setIsSmartListOpen(true)}
        onOpenTranscribe={() => setIsTranscribeModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSubscription={handleOpenSubscription}
        selectionActive={selectionActive}
        isContentEditable={documents.length > 0}
        isHighlightMode={isHighlightMode}
        openDocsCount={documents.length}
        ttsState={ttsState}
        recognitionState={recognitionState}
        onSetVoice={handleSetVoice}
        onSetRate={handleSetRate}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onToggleListen={toggleListening}
        onNextSentence={handleNextSentence}
        onPreviousSentence={handlePreviousSentence}
      />

      {/* Limit Notice Toast */}
      <AnimatePresence>
        {limitWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-amber-500 text-black font-semibold text-xs rounded-2xl shadow-xl border border-amber-600 max-w-md text-center"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span>{limitWarning}</span>
            <button onClick={() => setLimitWarning(null)} className="p-1 hover:bg-black/10 rounded-lg ml-1">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

        <SubscriptionModal 
          isOpen={subscriptionOpen} 
          onClose={() => setSubscriptionOpen(false)} 
          triggerReason={subscriptionReason || undefined}
        />

      <main className="flex-grow flex overflow-hidden relative">
        <AnimatePresence>
          {isDragging && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center p-8"
            >
              <div className="w-full max-w-2xl aspect-video border-4 border-dashed border-white/50 rounded-3xl flex flex-col items-center justify-center gap-4 text-white">
                <Upload size={64} className="animate-bounce" />
                <h2 className="text-3xl font-bold">Solte seu documento aqui</h2>
                <p className="text-lg opacity-80">Suporta PDF, DOCX, TXT e HTML (até 3 arquivos)</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading && (
          <div className="absolute inset-0 z-50 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-[2px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-zinc-900 dark:border-zinc-100 border-t-transparent rounded-full animate-spin" />
              <p className="font-medium animate-pulse text-sm">Processando documento...</p>
            </div>
          </div>
        )}

        <div className="flex-grow flex flex-col min-w-0 overflow-y-auto p-4 md:p-6 space-y-4">
          {documents.length > 0 ? (
            <div className="w-full h-full flex flex-col space-y-6">
              {/* Sequential display of up to 3 open documents */}
              {documents.map((doc) => {
                
                const isDocActive = doc.id === (activeDocumentId || documents[0].id);
                return (
                  <DocumentPanel
                    key={doc.id}
                    document={doc}
                    isActive={isDocActive}
                    isSpeaking={ttsState.isSpeaking}
                    zoom={zoom}
                    isHighlightMode={isHighlightMode}
                    onFocus={handleFocusDocument}
                    onToggleMinimize={handleToggleMinimize}
                    onClose={handleCloseDocument}
                    onSelectionChange={handleSelectionChange}
                    onHighlightText={handleHighlightText}
                    onAddNoteFromSelection={handleComment}
                    onPlayFromSelection={handlePlayFromSelection}
                    onPlayDocument={handlePlayDocument}
                    contentRef={isDocActive ? activeContentRef : { current: null }}
                    selectionInfo={isDocActive ? selectionInfo : null}
                  />
                );
              })}

              {/* Add another document prompt if under 3 documents limit */}
              {documents.length < MAX_DOCUMENTS && (
                <div className="flex items-center justify-center pt-2 pb-6">
                  <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl shadow-xs text-xs">
                    <span className="px-2 text-zinc-500 font-medium">
                      {documents.length} de {MAX_DOCUMENTS} documentos abertos
                    </span>
                    <button
                      onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-semibold transition-colors"
                    >
                      <Plus size={14} />
                      <span>Adicionar Arquivo</span>
                    </button>
                    <button
                      onClick={() => setIsDirectTextModalOpen(true)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-semibold transition-colors"
                    >
                      <Edit3 size={14} />
                      <span>Escrever/Colar</span>
                    </button>
                    <button
                      onClick={() => setIsUrlModalOpen(true)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-semibold transition-colors"
                    >
                      <Globe size={14} />
                      <span>Via URL</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center p-4 min-h-[400px]">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-xl w-full text-center space-y-8"
              >
                <div className="relative inline-block">
                  <div className="absolute -inset-4 bg-zinc-200 dark:bg-zinc-800 rounded-full blur-2xl opacity-50" />
                  <div className="relative bg-white dark:bg-zinc-900 w-24 h-24 rounded-3xl shadow-xl flex items-center justify-center mx-auto border border-zinc-200 dark:border-zinc-800">
                    <Sparkles size={40} className="text-zinc-900 dark:text-zinc-100" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tight">Leitor Inteligente com IA</h1>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Abra até 3 arquivos simultâneos, escreva ou cole seu texto, integre com Google Drive ou informe uma URL para leitura e estudo inteligente.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                  <button 
                    onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                    className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all group shadow-xs"
                  >
                    <FileText size={24} className="group-hover:scale-110 transition-transform text-zinc-800 dark:text-zinc-200" />
                    <span className="text-xs font-semibold">Abrir Arquivo</span>
                  </button>

                  <button 
                    onClick={() => setIsDirectTextModalOpen(true)}
                    className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all group shadow-xs"
                  >
                    <Edit3 size={24} className="group-hover:scale-110 transition-transform text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Escrever/Colar</span>
                  </button>

                  <button 
                    onClick={() => setIsGoogleDriveOpen(true)}
                    className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-blue-200/80 dark:border-blue-900/40 hover:border-blue-400 dark:hover:border-zinc-600 transition-all group shadow-xs"
                  >
                    <HardDrive size={24} className="group-hover:scale-110 transition-transform text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Google Drive</span>
                  </button>

                  <button 
                    onClick={() => setIsUrlModalOpen(true)}
                    className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all group shadow-xs"
                  >
                    <Globe size={24} className="group-hover:scale-110 transition-transform text-zinc-800 dark:text-zinc-200" />
                    <span className="text-xs font-semibold">Via URL</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>

        <CommentSidebar
          isOpen={isSidebarOpen}
          onToggle={handleToggleSidebar}
          comments={allComments}
          highlights={allHighlights}
          onDeleteComment={handleDeleteComment}
          onEditComment={handleEditComment}
          selectedVoice={ttsState.selectedVoice || undefined}
        />

        {/* Floating badge shown when auto-scroll is paused by user manual scroll */}
        <AnimatePresence>
          {ttsState.isSpeaking && isAutoScrollPaused && (
            <motion.button
              key="resume-autoscroll-pill"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              id="resume-autoscroll-btn"
              onClick={handleResumeAutoScroll}
              className="fixed bottom-24 right-8 z-50 bg-zinc-900/95 dark:bg-zinc-100/95 text-white dark:text-zinc-900 px-4 py-2.5 rounded-full shadow-2xl border border-zinc-700/60 dark:border-zinc-300 text-xs font-semibold flex items-center gap-2.5 backdrop-blur-md hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              title="A rolagem automática foi pausada porque você mexeu na barra de rolagem. Clique para voltar a acompanhar a leitura."
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span>Rolagem pausada • <span className="underline underline-offset-2 font-bold">Retomar acompanhamento</span></span>
              <Compass size={14} className="ml-0.5 text-blue-400 dark:text-blue-600" />
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      <DirectTextInputModal
        isOpen={isDirectTextModalOpen}
        onClose={() => setIsDirectTextModalOpen(false)}
        onSubmit={handleDirectTextSubmit}
      />

      <UrlInputModal
        isOpen={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
        onSubmit={handleUrlSubmit}
      />

      <GoogleDriveModal
        isOpen={isGoogleDriveOpen}
        onClose={() => setIsGoogleDriveOpen(false)}
        onSelectFile={(content, docFilename) => {
          handleStop();
          addDocument({
            title: docFilename,
            filename: docFilename,
            content,
            originalContent: content,
            contentType: 'html',
            type: 'drive',
          });
        }}
        currentDocument={activeDocument ? { filename: activeDocument.filename, content: activeDocument.content } : undefined}
      />

      <VoiceSelectorModal
        isOpen={isVoiceGalleryOpen}
        onClose={() => setIsVoiceGalleryOpen(false)}
        voices={ttsState.voices}
        selectedVoice={ttsState.selectedVoice}
        onSelectVoice={(voice) => {
          handleStop();
          handleSetVoice(voice);
        }}
      />

      <AddNoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        quotedText={noteQuotedText}
        onSave={handleSaveNote}
      />

      <SmartListPanel
        isOpen={isSmartListOpen}
        onClose={() => setIsSmartListOpen(false)}
        onOpenSubscription={handleOpenSubscription}
        onSpeakText={speakStandalone}
        selectedVoice={ttsState.selectedVoice}
      />

      <TranscribeModal
        isOpen={isTranscribeModalOpen}
        onClose={() => setIsTranscribeModalOpen(false)}
        onAddAsDocument={(title, text) => {
          handleStop();
          addDocument({
            title,
            filename: title,
            content: text.split('\n\n').map(p => `<p>${p}</p>`).join(''),
            originalContent: text,
            contentType: 'html',
            type: 'direct_text'
          });
        }}
        onAddAsListItem={() => {
          setIsSmartListOpen(true);
        }}
        onOpenSubscription={handleOpenSubscription}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default App;
