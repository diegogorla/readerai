import React, { useState } from 'react';
import { X, Check, CreditCard, Sparkles, Globe, Shield, Bell, Mic, Volume2, Flame, Layers, ExternalLink } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchWithAuth } from '../lib/authHelper';
import { openPaddleCheckout, openPaddleCustomerPortal, PADDLE_PRICES } from '../services/paddle';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerReason?: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, triggerReason }) => {
  const { user, userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<'BRL' | 'USD'>('BRL');
  const [planType, setPlanType] = useState<'monthly' | 'annual' | 'lifetime'>('annual');
  const [paymentProvider, setPaymentProvider] = useState<'paddle' | 'revenuecat' | 'googlepay'>('paddle');

  if (!isOpen) return null;

  const prices = {
    BRL: {
      monthly: { amount: 'R$ 5,99', period: '/mês', discount: '' },
      annual: { amount: 'R$ 59,90', period: '/ano', discount: 'Economize 17%' },
      lifetime: { amount: 'R$ 199,00', period: 'único', discount: 'Acesso Vitalício' }
    },
    USD: {
      monthly: { amount: '$1.99', period: '/mo', discount: '' },
      annual: { amount: '$19.90', period: '/yr', discount: 'Save 17%' },
      lifetime: { amount: '$79.90', period: 'one-time', discount: 'Lifetime Access' }
    }
  };

  const handleSubscribe = async () => {
    if (!user) {
      alert("Por favor, faça login ou autentique com o código 2FA antes de assinar.");
      return;
    }
    setLoading(true);
    try {
      if (paymentProvider === 'paddle') {
        const paddlePrice = PADDLE_PRICES[currency][planType];
        await openPaddleCheckout({
          priceId: paddlePrice.id,
          planType,
          currency,
          userEmail: user.email,
          userId: user.uid,
          onSuccess: async () => {
            await fetchWithAuth('/api/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planType,
                currency,
                provider: 'paddle'
              })
            });
            alert("🎉 Parabéns! Sua assinatura foi ativada com sucesso via Paddle!\nVocê agora tem acesso ilimitado a vozes naturais, ditado por voz, alarmes e itens infinitos.");
            onClose();
          },
          onError: (err) => {
            alert("Erro ao abrir checkout Paddle: " + (err?.message || err));
          }
        });
        return;
      }

      const response = await fetchWithAuth('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          currency,
          provider: paymentProvider
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar assinatura');
      }

      alert("🎉 Parabéns! Sua assinatura foi ativada com sucesso!\nVocê agora tem acesso ilimitado a vozes naturais, ditado por voz, alarmes e itens infinitos.");
      onClose();
    } catch (error: any) {
      console.error("Error subscribing:", error);
      alert(error.message || "Erro ao processar ativação do plano.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row relative my-auto border border-zinc-200 dark:border-zinc-800">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors z-20"
        >
          <X size={20} />
        </button>

        {/* Free Plan / Limitations */}
        <div className="flex-1 p-6 sm:p-8 md:p-10 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 flex flex-col">
          <div className="mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Plano Básico
            </span>
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">Gratuito</h3>
          </div>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">R$ 0</span>
            <span className="text-xs text-zinc-500 font-medium">/ 7 dias grátis</span>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-6">
            Ideal para testar os recursos básicos do aplicativo durante a fase de experimentação.
          </p>

          <ul className="space-y-3 mb-8 flex-1 text-xs text-zinc-700 dark:text-zinc-300">
            <li className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center text-[10px] font-bold">5</span>
              <span><strong>Máximo 5 itens ativos</strong> na lista</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Layers size={16} className="text-zinc-400 shrink-0" />
              <span>Apenas <strong>2 categorias fixas</strong> (não editáveis)</span>
            </li>
            <li className="flex items-center gap-2.5 text-zinc-400 dark:text-zinc-500 line-through">
              <Bell size={16} className="shrink-0" />
              <span>Alarmes e avisos com notificação sonoro</span>
            </li>
            <li className="flex items-center gap-2.5 text-zinc-400 dark:text-zinc-500 line-through">
              <Volume2 size={16} className="shrink-0" />
              <span>Vozes naturais de IA (Gemini, Antonio e OpenAI)</span>
            </li>
            <li className="flex items-center gap-2.5 text-zinc-400 dark:text-zinc-500 line-through">
              <Mic size={16} className="shrink-0" />
              <span>Ditar itens por comando de voz (Whisper)</span>
            </li>
          </ul>

          <div className="p-3 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-xl text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            {userData?.plan === 'pro' ? 'Você já possui o Plano Pro' : 'Seu plano atual'}
          </div>
        </div>

        {/* Pro Plan / Launch Promotion */}
        <div className="flex-[1.25] p-6 sm:p-8 md:p-10 bg-white dark:bg-zinc-900 relative flex flex-col">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600"></div>

          {triggerReason && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium">
              ⚡ {triggerReason}
            </div>
          )}

          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/10 to-indigo-500/10 dark:from-amber-500/20 dark:to-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-xs font-bold tracking-wide uppercase mb-2 border border-indigo-200 dark:border-indigo-800">
                <Flame size={14} className="text-amber-500" />
                <span>Promoção de Lançamento</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">Plano Pro</h3>
            </div>
            
            <button 
              onClick={() => setCurrency(c => c === 'BRL' ? 'USD' : 'BRL')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <Globe size={13} />
              {currency}
            </button>
          </div>

          {/* Plan Selector Buttons */}
          <div className="grid grid-cols-3 gap-1.5 mb-6 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl">
            {(['monthly', 'annual', 'lifetime'] as const).map(type => (
              <button
                key={type}
                onClick={() => setPlanType(type)}
                className={`py-2 px-2 text-xs font-bold rounded-xl transition-all relative ${
                  planType === type 
                    ? 'bg-white dark:bg-zinc-700 shadow-md text-zinc-900 dark:text-white scale-[1.02]' 
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {type === 'monthly' ? 'Mensal' : type === 'annual' ? 'Anual' : 'Vitalício'}
                {type === 'annual' && (
                  <span className="hidden sm:inline-block absolute -top-2.5 -right-1 bg-amber-500 text-zinc-950 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-xs">
                    -17%
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-4xl sm:text-5xl font-black text-indigo-600 dark:text-indigo-400">
              {prices[currency][planType].amount}
            </span>
            <span className="text-sm font-semibold text-zinc-500">
              {prices[currency][planType].period}
            </span>
            {prices[currency][planType].discount && (
              <span className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                {prices[currency][planType].discount}
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
            Após 7 dias grátis, aproveite a tarifa promocional de lançamento com desbloqueio integral.
          </p>

          <ul className="space-y-3 mb-8 flex-1 text-xs text-zinc-800 dark:text-zinc-200">
            <li className="flex items-center gap-2.5">
              <Check size={16} className="text-emerald-500 shrink-0" />
              <span><strong>Itens e Leituras Ilimitadas:</strong> crie quantas anotações desejar</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Check size={16} className="text-emerald-500 shrink-0" />
              <span><strong>Categorias Personalizadas Ilimitadas:</strong> organize seus estudos</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Check size={16} className="text-emerald-500 shrink-0" />
              <span><strong>Alarmes e Avisos Pontuais:</strong> alertas sonoros na hora certa</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Check size={16} className="text-emerald-500 shrink-0" />
              <span><strong>Ouvir Lista com Vozes Naturais de IA:</strong> Gemini, Microsoft Antonio e OpenAI</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Check size={16} className="text-emerald-500 shrink-0" />
              <span><strong>Ditar Itens por Comando de Voz:</strong> Whisper e Gemini integrados</span>
            </li>
          </ul>

          {/* Payment Method Selector */}
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-4 px-1">
            <span>Pagamento Seguro via:</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPaymentProvider('paddle')}
                className={`px-2 py-0.5 rounded border text-[11px] font-bold ${paymentProvider === 'paddle' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600' : 'border-zinc-300 dark:border-zinc-700'}`}
              >
                Paddle
              </button>
              <button 
                onClick={() => setPaymentProvider('revenuecat')}
                className={`px-2 py-0.5 rounded border text-[11px] font-bold ${paymentProvider === 'revenuecat' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600' : 'border-zinc-300 dark:border-zinc-700'}`}
              >
                RevenueCat (iOS App Store)
              </button>
            </div>
          </div>

          <button 
            onClick={handleSubscribe}
            disabled={loading || userData?.plan === 'pro'}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-xl shadow-indigo-500/25 transition-all disabled:opacity-50"
          >
            {loading ? 'Processando Assinatura...' : userData?.plan === 'pro' ? 'Você já é Assinante Pro!' : `Assinar ${planType === 'monthly' ? 'Mensal' : planType === 'annual' ? 'Anual' : 'Vitalício'} (${prices[currency][planType].amount})`}
            {!loading && userData?.plan !== 'pro' && <CreditCard size={18} />}
          </button>

          {userData?.plan !== 'pro' && (
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await fetchWithAuth('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planType: 'lifetime', currency: 'BRL', provider: 'instant_free' })
                  });
                  window.dispatchEvent(new Event('readerai_auth_changed'));
                  alert("🎉 Plano Pro Ilimitado ativado com sucesso para sua conta!");
                  onClose();
                } catch (e: any) {
                  onClose();
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="mt-2.5 w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-all flex items-center justify-center gap-1.5"
            >
              <Sparkles size={14} />
              <span>Ativar Plano Pro Gratuitamente (Acesso Imediato)</span>
            </button>
          )}

          {userData?.plan === 'pro' && (
            <button
              onClick={() => openPaddleCustomerPortal(userData?.paddleCustomerId)}
              className="mt-2 w-full py-2 px-3 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Gerenciar Assinatura & Faturas (Portal Paddle)</span>
              <ExternalLink size={13} />
            </button>
          )}

          <p className="text-[10px] text-center text-zinc-400 mt-3 flex items-center justify-center gap-1">
            <Shield size={12} />
            <span>Cancelamento fácil a qualquer momento • Pagamento seguro e criptografado</span>
          </p>
        </div>

      </div>
    </div>
  );
};
