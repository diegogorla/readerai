import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Check, Trash2, Bell, BellOff, Volume2, Mic, MicOff, 
  Lock, Sparkles, AlertCircle, Clock, Calendar, Tag, ChevronDown, 
  HelpCircle, CheckCircle2, ListTodo, ShieldAlert, X
} from 'lucide-react';
import { ListItem, Voice } from '../types';
import { useAuth } from '../hooks/useAuth';
import { fetchWithAuth } from '../lib/authHelper';
import {
  db,
  FREE_CATEGORIES,
  OperationType,
  handleFirestoreError,
  buildFirestoreItemCreatePayload,
  mapItemSnapToListItem,
  sanitizeId,
} from '../lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

interface SmartListPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSubscription: (reason?: string) => void;
  onSpeakText: (text: string, voice?: Voice) => void;
  selectedVoice?: Voice | null;
}

export const SmartListPanel: React.FC<SmartListPanelProps> = ({
  isOpen,
  onClose,
  onOpenSubscription,
  onSpeakText,
  selectedVoice
}) => {
  const { user, userData, authReady, isPro, trialDaysRemaining, isTrialExpired } = useAuth();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newNotes, setNewNotes] = useState('');
  const [hasAlarm, setHasAlarm] = useState(false);
  const [alarmTime, setAlarmTime] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  
  // Audio recording state for voice dictation
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Default and available categories
  const freeCategories = [...FREE_CATEGORIES];
  const categories = isPro 
    ? Array.from(new Set([...freeCategories, ...(userData?.categories || []), ...items.map(i => i.category)]))
    : freeCategories;

  // Active items count (not completed)
  const activeItemsCount = items.filter(i => !i.completed).length;
  const isPast7Days = isTrialExpired;

  // Real-time Firestore listener for user's Smart List items
  useEffect(() => {
    if (!authReady || !user) {
      setItems([]);
      return;
    }

    setLoading(true);
    const itemsPath = `users/${user.uid}/items`;
    const itemsQuery = query(
      collection(db, 'users', user.uid, 'items'),
      where('ownerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const loaded = snapshot.docs
          .map((d) => mapItemSnapToListItem(d.id, d.data()))
          .sort((a, b) => b.createdAt - a.createdAt);
        setItems(loaded);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, itemsPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  // Check alarms in background
  useEffect(() => {
    if (!isPro) return;

    const interval = setInterval(() => {
      const now = new Date();
      items.forEach(item => {
        if (item.hasAlarm && item.alarmTime && !item.completed) {
          const alarmDate = new Date(item.alarmTime);
          // Check if due within current minute
          if (Math.abs(now.getTime() - alarmDate.getTime()) < 30000) {
            // Trigger audio beep or speech reminder
            onSpeakText(`Atenção: Lembrete do item ${item.title}`);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`⏰ Alarme Leitor AI: ${item.title}`, {
                body: item.notes || `Categoria: ${item.category}`
              });
            }
          }
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [items, isPro, onSpeakText]);

  // Request notification permission if Pro
  useEffect(() => {
    if (isPro && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isPro]);

  // Add Item Handler with Strict Checks + Firestore Persistence
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setPanelError(null);
    if (!newTitle.trim() || !user) return;

    if (!isPro && isPast7Days) {
      onOpenSubscription("Seu período de teste gratuito de 7 dias expirou. Escolha um plano promocional para continuar inserindo itens.");
      return;
    }

    if (!isPro && activeItemsCount >= 5) {
      onOpenSubscription("Limite gratuito atingido! O plano gratuito permite no máximo 5 itens ativos na lista. Assine o plano Pro para adicionar itens ilimitados.");
      return;
    }

    if (!isPro && hasAlarm) {
      onOpenSubscription("O recurso de alarme (aviso) com alerta sonoro e notificação só está disponível nos planos pagos.");
      return;
    }

    const safeCategory = isPro
      ? (newCategory.trim() || 'Geral')
      : (freeCategories.includes(newCategory as any) ? newCategory : 'Geral');

    const itemId = sanitizeId(`item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const itemPath = `users/${user.uid}/items/${itemId}`;
    const payload = buildFirestoreItemCreatePayload(user.uid, {
      id: itemId,
      title: newTitle.trim(),
      category: safeCategory,
      notes: newNotes.trim(),
      hasAlarm: isPro ? hasAlarm : false,
      alarmTime: isPro && hasAlarm ? alarmTime : null,
    });

    try {
      await setDoc(doc(db, 'users', user.uid, 'items', itemId), payload);
      setNewTitle('');
      setNewNotes('');
      setHasAlarm(false);
      setAlarmTime('');
    } catch (err: any) {
      setPanelError('Não foi possível salvar o item no Firestore.');
      handleFirestoreError(err, OperationType.CREATE, itemPath);
    }
  };

  // Toggle Completed
  const handleToggleComplete = async (item: ListItem) => {
    if (!user) return;
    setPanelError(null);
    const itemPath = `users/${user.uid}/items/${item.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'items', item.id), {
        completed: !item.completed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setPanelError('Erro ao atualizar status do item.');
      handleFirestoreError(err, OperationType.UPDATE, itemPath);
    }
  };

  // Delete Item
  const handleDeleteItem = async (id: string) => {
    if (!user) return;
    setPanelError(null);
    const itemPath = `users/${user.uid}/items/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'items', id));
    } catch (err) {
      setPanelError('Erro ao excluir item.');
      handleFirestoreError(err, OperationType.DELETE, itemPath);
    }
  };

  // Voice Dictation (Whisper / Gemini)
  const handleStartDictation = async () => {
    // Rule: Voice dictation is only available for paid subscription
    if (!isPro) {
      onOpenSubscription("O comando de voz e ditado de itens (via OpenAI Whisper e Gemini) é exclusivo para assinantes pagos.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setRecordingStatus("Transcrevendo com Whisper / Gemini...");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert Blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Audio = (reader.result as string).split(',')[1];
            const response = await fetchWithAuth('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType: 'audio/webm',
                engine: 'whisper' // Will try Whisper then fallback to Gemini
              })
            });

            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              setPanelError(err.message || err.error || "Erro na transcrição.");
              return;
            }

            const data = await response.json();
            if (data.text) {
              setNewTitle(data.text);
            }
          } catch (transcribeErr) {
            console.error("Transcription error:", transcribeErr);
            setPanelError("Falha ao transcrever voz.");
          } finally {
            setIsRecording(false);
            setRecordingStatus(null);
            // Stop mic tracks
            stream.getTracks().forEach(track => track.stop());
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingStatus("Gravando... Fale o item a adicionar");
    } catch (err) {
      console.error("Mic access error:", err);
      setPanelError("Acesso ao microfone não autorizado ou indisponível.");
    }
  };

  const handleStopDictation = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  // Natural Voice Playback of the list
  const handleListenListWithNaturalVoice = () => {
    // Rule: "Para ouvir a lista com voz natural, precisa ter assinatura também"
    if (!isPro) {
      onOpenSubscription("Para ouvir sua lista com vozes ultra-naturais de IA (Gemini, Antonio da Microsoft e OpenAI), é necessário ter o Plano Pro.");
      return;
    }

    const activeList = items.filter(i => !i.completed);
    if (activeList.length === 0) {
      setPanelError("Sua lista não possui itens ativos pendentes.");
      return;
    }

    const fullScript = activeList.map((item, idx) => {
      const alarmPart = item.hasAlarm && item.alarmTime ? `, com alarme programado para ${new Date(item.alarmTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
      return `Item número ${idx + 1}: ${item.title}, na categoria ${item.category}${alarmPart}. ${item.notes ? `Observações: ${item.notes}` : ''}`;
    }).join('. ');

    onSpeakText(`Você tem ${activeList.length} itens ativos na sua lista. ${fullScript}`, selectedVoice || undefined);
  };

  if (!isOpen) return null;

  const filteredItems = selectedCategoryFilter === 'all'
    ? items
    : items.filter(i => i.category === selectedCategoryFilter);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] relative">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ListTodo size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Minha Lista Inteligente</h2>
                {isPro ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                    <Sparkles size={11} /> Pro Ilimitado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold">
                    Gratuito ({activeItemsCount}/5 ativos)
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Organize leituras, estudos e tarefas com voz natural e alarmes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleListenListWithNaturalVoice}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isPro 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20' 
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-purple-600 border border-zinc-200 dark:border-zinc-700'
              }`}
              title={isPro ? "Ouvir lista com voz natural" : "Recurso exclusivo do Plano Pro"}
            >
              <Volume2 size={16} />
              <span className="hidden sm:inline">Ouvir Lista com Voz Natural</span>
              {!isPro && <Lock size={12} className="text-amber-500" />}
            </button>

            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 7-Day Trial Notification Banner (if Free) */}
        {!isPro && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/40 px-4 py-2 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Clock size={15} className="shrink-0 text-amber-600" />
              <span>
                {isPast7Days 
                  ? "Seu período de teste de 7 dias encerrou. Faça upgrade para continuar adicionando itens."
                  : `Período gratuito de lançamento: ${trialDaysRemaining} dias restantes.`}
              </span>
            </div>
            <button 
              onClick={() => onOpenSubscription("Faça upgrade agora e desbloqueie alarmes, voz natural e itens ilimitados!")}
              className="font-bold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100 ml-2 shrink-0"
            >
              Ver Planos Promocionais
            </button>
          </div>
        )}

        {/* Inline Error Notice */}
        {panelError && (
          <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/50 px-4 py-2 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{panelError}</span>
            </div>
            <button onClick={() => setPanelError(null)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Add Item Form */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <form onSubmit={handleAddItem} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={isRecording ? "Ouvindo sua voz..." : "O que você precisa ler, estudar ou lembrar?"}
                className="flex-grow px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100"
                required
              />

              {/* Voice Dictation Button */}
              <button
                type="button"
                onClick={isRecording ? handleStopDictation : handleStartDictation}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : isPro 
                      ? 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-indigo-600 dark:text-indigo-400 border border-zinc-200 dark:border-zinc-700' 
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-indigo-500 border border-zinc-200 dark:border-zinc-700'
                }`}
                title={isPro ? (isRecording ? "Clique para finalizar ditado" : "Ditar item por voz (Whisper / Gemini)") : "Ditado por voz exclusivo do Plano Pro"}
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                <span className="hidden sm:inline">{isRecording ? "Parar" : "Ditar"}</span>
                {!isPro && <Lock size={11} className="text-amber-500" />}
              </button>

              <button
                type="submit"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-sm"
              >
                <Plus size={16} />
                <span>Adicionar</span>
              </button>
            </div>

            {recordingStatus && (
              <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span>{recordingStatus}</span>
              </div>
            )}

            {/* Options: Category, Notes, Alarm */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              
              {/* Category selector */}
              <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs">
                <Tag size={13} className="text-zinc-400" />
                <select
                  value={newCategory}
                  onChange={(e) => {
                    if (!isPro && !freeCategories.includes(e.target.value)) {
                      onOpenSubscription("Categorias personalizadas exclusivas para assinantes Pro.");
                      return;
                    }
                    setNewCategory(e.target.value);
                  }}
                  className="bg-transparent text-zinc-700 dark:text-zinc-300 font-medium focus:outline-none cursor-pointer"
                >
                  {categories.map(c => (
                    <option key={c} value={c} className="bg-white dark:bg-zinc-900">{c}</option>
                  ))}
                </select>
                {!isPro && (
                  <span title="Plano gratuito possui 2 categorias fixas não editáveis">
                    <Lock size={10} className="text-amber-500 ml-1" />
                  </span>
                )}
              </div>

              {/* Alarm Button & Time Picker */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!isPro) {
                      onOpenSubscription("Alarmes e avisos sonoros pontuais são exclusivos dos planos pagos.");
                      return;
                    }
                    setHasAlarm(!hasAlarm);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                    hasAlarm 
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700' 
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:text-zinc-700'
                  }`}
                >
                  <Bell size={13} />
                  <span>Alarme (Aviso)</span>
                  {!isPro && <Lock size={10} className="text-amber-500 ml-0.5" />}
                </button>

                {hasAlarm && isPro && (
                  <input
                    type="datetime-local"
                    value={alarmTime}
                    onChange={(e) => setAlarmTime(e.target.value)}
                    className="px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none"
                    required
                  />
                )}
              </div>

              {/* Quick Note input */}
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Observação rápida (opcional)"
                className="flex-grow min-w-[150px] px-2.5 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none"
              />
            </div>
          </form>
        </div>

        {/* Category Filters Bar */}
        <div className="px-4 py-2 bg-zinc-50/70 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto scrollbar-hide text-xs">
          <span className="text-zinc-400 font-semibold uppercase text-[10px] shrink-0">Filtrar:</span>
          <button
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
              selectedCategoryFilter === 'all'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            Todos ({items.length})
          </button>
          {categories.map(cat => {
            const count = items.filter(i => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                  selectedCategoryFilter === cat
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Items List */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-5 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <ListTodo size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">Nenhum item cadastrado nesta categoria</p>
              <p className="text-xs text-zinc-500 mt-1">
                Adicione lembretes, textos para leitura ou ditar novos tópicos acima.
              </p>
            </div>
          ) : (
            filteredItems.map(item => (
              <div 
                key={item.id}
                className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  item.completed 
                    ? 'bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-800/40 opacity-60' 
                    : 'bg-white dark:bg-zinc-850 border-zinc-200 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    onClick={() => handleToggleComplete(item)}
                    className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                      item.completed 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : 'border-zinc-300 dark:border-zinc-600 hover:border-indigo-500'
                    }`}
                  >
                    {item.completed && <Check size={14} />}
                  </button>

                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${item.completed ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {item.title}
                    </p>
                    
                    {item.notes && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                        {item.notes}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {item.category}
                      </span>

                      {item.hasAlarm && item.alarmTime && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50">
                          <Bell size={10} />
                          <span>{new Date(item.alarmTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onSpeakText(item.title, selectedVoice || undefined)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Ouvir este item"
                  >
                    <Volume2 size={16} />
                  </button>

                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Excluir item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <div>
            {!isPro ? (
              <span>Plano Gratuito: <strong>{activeItemsCount}/5</strong> itens ativos utilizados</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 size={14} /> Itens e alarmes ilimitados ativos
              </span>
            )}
          </div>

          {!isPro && (
            <button
              onClick={() => onOpenSubscription("Assine o Plano Pro e tenha itens e categorias ilimitadas!")}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              Fazer Upgrade para Pro
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
