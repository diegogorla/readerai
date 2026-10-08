import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Sparkles, X, Check, Copy, FileText, ListTodo, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../lib/authHelper';
import { useAuth } from '../hooks/useAuth';

interface TranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAsDocument: (title: string, text: string) => void;
  onAddAsListItem?: (text: string) => void;
  onOpenSubscription: (reason?: string) => void;
}

export const TranscribeModal: React.FC<TranscribeModalProps> = ({
  isOpen,
  onClose,
  onAddAsDocument,
  onAddAsListItem,
  onOpenSubscription
}) => {
  const { userData } = useAuth();
  const isPro = userData?.plan === 'pro';

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [engine, setEngine] = useState<'gemini' | 'whisper'>('gemini');
  const [transcribedText, setTranscribedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  if (!isOpen) return null;

  const startRecording = async () => {
    if (!isPro) {
      onOpenSubscription("A transcrição de áudio por microfone com IA (Gemini & Whisper) é exclusiva para assinantes pagos.");
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setLoading(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1];
            const response = await fetchWithAuth('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Data,
                mimeType: 'audio/webm',
                engine
              })
            });

            const data = await response.json();
            if (!response.ok) {
              if (data.requiresSubscription) {
                onOpenSubscription(data.message);
                return;
              }
              throw new Error(data.error || 'Erro ao processar transcrição');
            }

            setTranscribedText(data.text || '');
          } catch (err: any) {
            console.error("Transcription error:", err);
            setError(err.message || 'Falha ao transcrever o áudio');
          } finally {
            setLoading(false);
            // Clean up microphone stream
            stream.getTracks().forEach(t => t.stop());
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone error:", err);
      setError("Permissão para microfone não concedida ou dispositivo não encontrado.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = () => {
    if (!transcribedText) return;
    navigator.clipboard.writeText(transcribedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddToReader = () => {
    if (!transcribedText) return;
    onAddAsDocument(`Transcrição de Voz (${new Date().toLocaleTimeString()})`, transcribedText);
    onClose();
  };

  const handleAddToList = () => {
    if (!transcribedText) return;
    if (onAddAsListItem) {
      onAddAsListItem(transcribedText);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden relative p-6 sm:p-8">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Mic size={26} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Transcrever Áudio com IA</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Fale ao microfone e converta sua voz em texto usando modelos Gemini e OpenAI Whisper
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Engine Selection */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setEngine('gemini')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              engine === 'gemini'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
            }`}
          >
            <Sparkles size={14} />
            <span>Google Gemini</span>
          </button>

          <button
            type="button"
            onClick={() => setEngine('whisper')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              engine === 'whisper'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
            }`}
          >
            <span>OpenAI Whisper</span>
          </button>
        </div>

        {/* Recording Visualizer & Controls */}
        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 text-center mb-6">
          <div className="relative inline-block mb-3">
            {isRecording && (
              <span className="absolute -inset-3 rounded-full bg-red-500/30 animate-ping"></span>
            )}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={loading}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-transform active:scale-95 ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
            </button>
          </div>

          <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
            {isRecording ? `Gravando... ${formatSeconds(recordingDuration)}` : loading ? 'Processando áudio com IA...' : 'Clique no microfone para falar'}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {isRecording ? 'Fale normalmente. Clique novamente para concluir e transcrever.' : 'Ditado contínuo em português ou qualquer idioma suportado.'}
          </p>
        </div>

        {/* Transcribed Text Display */}
        {loading && (
          <div className="py-6 text-center text-xs text-zinc-500 animate-pulse flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin text-indigo-600" />
            <span>Transcrevendo áudio com {engine === 'gemini' ? 'Google Gemini' : 'OpenAI Whisper'}...</span>
          </div>
        )}

        {transcribedText && !loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Texto Transcrito:
              </span>
              <button
                onClick={handleCopy}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <textarea
              rows={4}
              value={transcribedText}
              onChange={(e) => setTranscribedText(e.target.value)}
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100"
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleAddToReader}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
              >
                <FileText size={15} />
                <span>Abrir no Leitor</span>
              </button>

              <button
                onClick={handleAddToList}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
              >
                <ListTodo size={15} />
                <span>Salvar na Minha Lista</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
