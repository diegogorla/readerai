import React from 'react';
import { BookOpen, Sparkles, Headphones, ShieldCheck, Zap, Bell, Mic, Check, Flame } from 'lucide-react';

interface LandingPageProps {
  onOpenAuth?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  const handleDirectEnter = () => {
    try {
      const defaultUser = {
        uid: 'dgorla_official',
        email: 'dgorla@gmail.com',
        displayName: 'Dgorla',
      };
      localStorage.setItem('readerai_session_user', JSON.stringify(defaultUser));
      localStorage.setItem('readerai_session_token', 'session_dgorla_pro');
      window.dispatchEvent(new Event('readerai_auth_changed'));
    } catch {
      if (onOpenAuth) onOpenAuth();
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
          onClick={handleDirectEnter}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-500/20"
        >
          Entrar Direto no Leitor
        </button>
      </header>
      
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-4 border border-amber-300 dark:border-amber-800">
            <Flame size={14} className="text-amber-500" />
            <span>Lançamento • Acesso Ilimitado Liberado</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight mb-5">
            Ouça Documentos e Gerencie Listas com{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
              Vozes Naturais de IA
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Transforme PDFs, links, textos e tarefas em áudio de alta fidelidade com <strong>ElevenLabs Eleven V4</strong>, <strong>Voz Dgorla</strong> e <strong>Gemini TTS</strong>.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              onClick={handleDirectEnter}
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-base transition-all shadow-xl shadow-indigo-500/25 hover:scale-105"
            >
              Abrir Leitor Imediatamente
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-20">
          <div className="bg-white dark:bg-zinc-900 p-7 rounded-3xl shadow-sm border border-gray-200 dark:border-zinc-800 text-center">
            <Headphones className="w-10 h-10 text-indigo-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Vozes Antonio & Gemini</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Destaque de palavras em tempo real e rolagem inteligente enquanto ouve com a voz Antonio da Microsoft e Gemini.
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
            <h3 className="text-lg font-bold mb-2">Ditado por Voz com Whisper</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Dite itens e comandos rapidamente pelo microfone usando a API Whisper da OpenAI e Gemini.
            </p>
          </div>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3">Promoção de Lançamento</h2>
          <p className="text-gray-600 dark:text-gray-400">Após os 7 dias grátis, escolha o plano ideal para continuar sem limites.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-gray-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-bold mb-2">Plano Gratuito</h3>
              <p className="text-sm text-gray-500 mb-6">Para testar a plataforma nos primeiros 7 dias</p>
              <div className="text-4xl font-extrabold mb-6">R$ 0<span className="text-base font-normal text-gray-500"> / 7 dias</span></div>
              <ul className="space-y-3 mb-8 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-center gap-2.5"><Check size={18} className="text-emerald-500" /> Até 5 itens ativos na lista</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-emerald-500" /> 2 categorias fixas não editáveis</li>
                <li className="flex items-center gap-2.5 text-gray-400 line-through">Alarmes com alertas sonoros</li>
                <li className="flex items-center gap-2.5 text-gray-400 line-through">Ouvir lista com vozes naturais de IA</li>
                <li className="flex items-center gap-2.5 text-gray-400 line-through">Ditado de voz com Whisper</li>
              </ul>
            </div>
            <button onClick={onOpenAuth} className="w-full py-3.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl font-bold text-sm transition-colors">
              Experimentar Grátis
            </button>
          </div>

          {/* Pro Tier */}
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
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Itens e leituras ilimitadas</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Categorias personalizadas ilimitadas</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Alarmes e avisos com som ativo</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Vozes Naturais Gemini, Antonio e OpenAI</li>
                <li className="flex items-center gap-2.5"><Check size={18} className="text-amber-400" /> Ditado por comando de voz Whisper</li>
              </ul>
            </div>

            <button onClick={onOpenAuth} className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black text-sm tracking-wide transition-all shadow-lg shadow-indigo-500/40">
              Assinar Plano Pro
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
