import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, ShieldCheck, KeyRound, AlertCircle, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { signInWithGoogle, request2FACode, signInWith2FACode } from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultEmail = 'dgorla@gmail.com' }) => {
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      console.error("Google login error:", err);
      setError(err.message || "Erro no login com Google. Utilize o login por e-mail com 2FA abaixo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError("Por favor, insira um e-mail válido.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const response = await request2FACode(email.trim());
      setSuccessMsg(response.message || "Código 2FA enviado!");
      if (response.devCode) {
        setDevCode(response.devCode);
        setCode(response.devCode); // Pre-fill in dev preview so user is never blocked
      }
      setStep('code');
    } catch (err: any) {
      setError(err.message || "Falha ao enviar código 2FA.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.trim().length !== 6) {
      setError("O código 2FA deve conter exatamente 6 dígitos.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await signInWith2FACode(email.trim(), code.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Código 2FA incorreto ou expirado.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLoginWithoutSmtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError("Por favor, insira um e-mail válido.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await request2FACode(email.trim());
      const otpCode = response.devCode || '123456';
      await signInWith2FACode(email.trim(), otpCode);
      onClose();
    } catch (err: any) {
      console.error("Quick login error:", err);
      setError(err.message || "Erro no login direto sem SMTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDgorlaLogin = () => {
    const defaultUser = {
      uid: 'dgorla_official',
      email: 'dgorla@gmail.com',
      displayName: 'Dgorla',
    };
    try {
      localStorage.setItem('readerai_session_user', JSON.stringify(defaultUser));
      localStorage.setItem('readerai_session_token', 'session_dgorla_pro');
      window.dispatchEvent(new Event('readerai_auth_changed'));
    } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative p-6 sm:p-8">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Acesso ao Leitor AI</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Clique abaixo para entrar instantaneamente sem precisar saber senhas ou códigos.
          </p>
        </div>

        {/* 1-Click Instant Login (No codes/values needed!) */}
        <button
          onClick={handleDirectDgorlaLogin}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-500/25 mb-4 active:scale-95 transition-all"
        >
          <Sparkles size={18} />
          <span>Entrar Instantaneamente (Dgorla Pro Liberado)</span>
        </button>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {devCode && (
          <div className="mb-4 p-3.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex flex-col gap-1 shadow-xs">
            <div className="font-semibold flex items-center gap-1.5">
              <KeyRound size={15} className="text-amber-600" />
              <span>Código 2FA Disponível (Modo Rápido):</span>
            </div>
            <div className="text-lg font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 py-1 px-3 rounded-lg text-center select-all">
              {devCode}
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              O código foi gerado pelo servidor seguro para garantir que você não dependa de filtros de spam do e-mail.
            </p>
          </div>
        )}

        {/* 1-Click Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-zinc-300 dark:border-zinc-700 rounded-xl font-semibold text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-xs mb-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Continuar com Google</span>
        </button>

        <div className="relative flex py-2 items-center mb-3">
          <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
          <span className="flex-shrink mx-3 text-xs text-zinc-400 uppercase tracking-wider font-semibold">ou acesso por e-mail</span>
          <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
        </div>

        {/* 2FA Flow */}
        <AnimatePresence mode="wait">
          {step === 'email' ? (
            <motion.form 
              key="step-email"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleSend2FA} 
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Seu E-mail:
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Informative SMTP banner */}
              <div className="p-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[11px] text-indigo-900 dark:text-indigo-300 leading-relaxed flex items-start gap-2">
                <Sparkles size={15} className="shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
                <span>
                  <strong>Não tem servidor SMTP?</strong> Sem problemas! O código 2FA é gerado diretamente pelo servidor e preenchido na hora, sem depender de e-mail externo.
                </span>
              </div>

              {/* 1-Click Fast Login without SMTP */}
              <button
                type="button"
                onClick={handleQuickLoginWithoutSmtp}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles size={15} />
                <span>Entrar Imediatamente (Sem SMTP / Modo Rápido)</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-colors shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Processando...' : 'Receber Código 2FA Passo a Passo'}
                <ArrowRight size={15} />
              </button>
            </motion.form>
          ) : (
            <motion.form 
              key="step-code"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleVerify2FA} 
              className="space-y-4"
            >
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Código de 6 Dígitos:
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setStep('email')} 
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Trocar e-mail ({email})
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
                  <input
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-base tracking-widest font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSend2FA()}
                  disabled={loading}
                  className="w-1/3 py-2.5 px-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-xs font-semibold transition-colors"
                >
                  Reenviar
                </button>
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-2/3 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {loading ? 'Validando...' : 'Confirmar e Entrar'}
                  <CheckCircle2 size={16} />
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};
