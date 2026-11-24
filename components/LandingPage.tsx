import React, { useState } from 'react';
import { BookOpen, Headphones, Bell, Mic, Check, Flame, AlertCircle } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';

interface LandingPageProps {
  onOpenAuth?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleEnter = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setAuthError(err?.message || 'Não foi possível entrar com o Google.');
      if (onOpenAuth) onOpenAuth();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-gray-100 font-sans">
      <header className="px-6 py-4 flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <BookOpen className="text-indigo-600 dark:text-indigo-400" size={24} />
          <span className="font-extrabold text-xl tracking-tight">Leitor AI</span>
        </div>
        <button
          onClick={handleGoogleEnter}
          disabled={signingIn}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-500/20 disabled:opacity-60 flex items-center gap-2"
        >
          <span>{signingIn ? 'Conectando...' : 'Entrar com Google'}</span>
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {authError && (
          <div className="max-w-xl mx-auto mb-8 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-4 border border-amber-300 dark:border-amber-800">
            <Flame size={14} className="text-amber-500" />
            <span>7 Dias Grátis • Sincronização em Nuvem</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight mb-5">
            Ouça Documentos e Gerencie Listas com{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
              Vozes Naturais de IA
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Transforme PDFs, links, textos e tarefas em áudio de alta fidelidade com <strong>ElevenLabs</strong>, <strong>Gemini TTS</strong> e <strong>OpenAI</strong>, com salvamento automático na sua conta Google.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              onClick={handleGoogleEnter}
              disabled={signingIn}
              className="px-8 py-4 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 rounded-2xl font-bold text-base transition-all shadow-xl hover:scale-[1.02] disabled:opacity-60 flex items-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{signingIn ? 'Entrando com Google...' : 'Começar Grátis com Google'}</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-20">
          <div className="bg-white dark:bg-zinc-900 p-7 rounded-3xl shadow-sm border border-gray-200 dark:border-zinc-800 text-center">
            <Headphones className="w-10 h-10 text-indigo-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Vozes Naturais & Sincronia</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Destaque de palavras em tempo real e rolagem inteligente enquanto ouve seus documentos e artigos.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-7 rounded-3xl shadow-sm border border-gray-200 dark:border-zinc-800 text-center">
            <Bell className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Lista com Alarmes e Avisos</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Organize seus estudos e leituras pendentes em categorias inteligentes com alarmes e notificações pontuais.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-7 rounded-3xl shadow-sm border border-gray-200 dark:border-zinc-800 text-center">
            <Mic className="w-10 h-10 text-purple-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Ditado, Tradução & Notas IA</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Traduza trechos selecionados, gere resumos de estudo com IA e dite itens diretamente pelo microfone.
            </p>
          </div>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3">Planos e Assinaturas</h2>
          <p className="text-gray-600 dark:text-gray-400">Comece com 7 dias gratuitos e faça upgrade quando precisar de acesso ilimitado.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-gray-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-bold mb-2">Plano Gratuito</h3>
              <p className="text-sm text-gray-500 mb-6">Para experimentar a plataforma nos primeiros 7 dias</p>
              <div className="text-4xl font-extrabold mb-6">R$ 0<span className="text-base font-normal text-gray-500"> / 7 dias</span></div>
              <ul className="space-y-3 mb-8 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-center gap-2.5"><Check size={18} className="text-emerald-500" /> Até 1 documento aberto por vez (2 leituras por fonte)</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-emerald-500" /> Até 5 itens ativos na Lista Inteligente</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-emerald-500" /> 2 categorias fixas</li>
                <li className="flex items-center gap-2.5 text-gray-400 line-through">Alarmes com alertas sonoros</li>
                <li className="flex items-center gap-2.5 text-gray-400 line-through">Vozes neurais de IA e ditado por voz</li>
              </ul>
            </div>
            <button onClick={handleGoogleEnter} disabled={signingIn} className="w-full py-3.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl font-bold text-sm transition-colors">
              Experimentar Grátis com Google
            </button>
          </div>

          <div className="bg-gradient-to-b from-indigo-900 to-zinc-900 text-white rounded-3xl p-8 border-2 border-indigo-500 shadow-2xl relative flex flex-col justify-between">
            <div className="absolute -top-3.5 right-8">
              <span className="bg-gradient-to-r from-amber-500 to-pink-500 text-zinc-950 text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-wider shadow-md">
                Mais Popular
              </span>
            </div>
            <div>
              <h3 className="text-2xl font-extrabold mb-1">Plano Pro</h3>
              <p className="text-sm text-indigo-200 mb-6">Acesso ilimitado a todas as ferramentas</p>

              <div className="flex flex-col gap-1 mb-6">
                <div className="text-4xl font-black text-white">R$ 5,99<span className="text-base font-normal text-indigo-300">/mês</span></div>
                <div className="text-sm text-indigo-300">ou <strong>R$ 59,90/ano</strong> (economize 17%) | <strong>R$ 199,00</strong> vitalício</div>
              </div>

              <ul className="space-y-3 mb-8 text-sm text-indigo-100">
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Leituras e documentos ilimitados (até 3 abertos juntos)</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Itens e categorias personalizadas ilimitadas</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Alarmes e avisos com som ativo</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Vozes Naturais ElevenLabs, Gemini, Antonio e OpenAI</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Ditado por comando de voz com Whisper & Gemini</li>
              </ul>
            </div>

            <button onClick={handleGoogleEnter} disabled={signingIn} className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black text-sm tracking-wide transition-all shadow-lg shadow-indigo-500/40">
              Entrar com Google para Assinar
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
