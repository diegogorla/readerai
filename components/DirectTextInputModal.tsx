import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Clipboard, Trash2, Play, Sparkles } from 'lucide-react';

interface DirectTextInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, title?: string) => void;
}

export const DirectTextInputModal: React.FC<DirectTextInputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setText('');
      setTitle('');
      setError('');
    }
  }, [isOpen]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          setText(prev => (prev ? prev + '\n\n' + clipText : clipText));
          setError('');
        }
      } else {
        alert('Seu navegador não permite acesso direto à área de transferência. Use Ctrl+V ou Cmd+V.');
      }
    } catch {
      alert('Permissão para ler a área de transferência negada ou indisponível.');
    }
  };

  const handleClear = () => {
    setText('');
    setTitle('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Por favor, digite ou cole um texto para ouvir.');
      return;
    }
    onSubmit(text.trim(), title.trim() || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/60 dark:bg-zinc-900/60">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                <FileText size={22} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Escrever ou Colar Texto
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Digite ou cole qualquer conteúdo para leitura e anotações imediatas
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden p-5 space-y-4">
            {/* Title input */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Título do Documento (Opcional)
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Artigo sobre Inteligência Artificial, Anotação de Estudo..."
                className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Content Textarea */}
            <div className="flex-grow flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Conteúdo do Texto <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Clipboard size={13} />
                    <span>Colar da Área de Transferência</span>
                  </button>
                  {text && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 ml-2"
                    >
                      <Trash2 size={13} />
                      <span>Limpar</span>
                    </button>
                  )}
                </div>
              </div>
              <textarea
                autoFocus
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Cole seu artigo, notícia, resumo ou digite seu texto aqui..."
                className="flex-grow w-full p-4 text-sm bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-sans leading-relaxed min-h-[180px]"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 font-medium">
                {error}
              </p>
            )}

            {/* Footer Stats & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-3">
                <span>{wordCount} palavras</span>
                <span>•</span>
                <span>{charCount} caracteres</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm active:scale-95"
                >
                  <Play size={14} fill="currentColor" />
                  <span>Abrir e Ouvir</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
