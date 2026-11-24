import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth,
  db,
  onAuthStateChanged,
  User,
  ensureUserProfile,
  handleFirestoreError,
  OperationType,
  toMillis,
  BOOTSTRAP_ADMIN_EMAIL,
  FREE_CATEGORIES,
} from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface UserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan: 'free' | 'pro';
  role: 'user' | 'admin';
  planType: 'none' | 'monthly' | 'annual' | 'lifetime';
  categories: string[];
  usageFile: number;
  usageUrl: number;
  usageText: number;
  createdAt: number;
  updatedAt: number;
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: 'TRIAL_EXPIRED' | 'LIMIT_REACHED' | 'AUTH_REQUIRED';
  message?: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  authReady: boolean;
  isPro: boolean;
  isAdmin: boolean;
  trialDaysRemaining: number;
  isTrialExpired: boolean;
  checkAndIncrementUsage: (source: 'file' | 'url' | 'text') => Promise<UsageCheckResult>;
  adminSetPlanPreview: (targetPlan: 'free' | 'pro') => Promise<void>;
}

const FREE_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_LIMIT_PER_SOURCE = 2;

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  authReady: false,
  isPro: false,
  isAdmin: false,
  trialDaysRemaining: 7,
  isTrialExpired: false,
  checkAndIncrementUsage: async () => ({ allowed: false, reason: 'AUTH_REQUIRED' }),
  adminSetPlanPreview: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (!firebaseUser) {
        if (isMounted) {
          setUser(null);
          setUserData(null);
          setLoading(false);
          setAuthReady(true);
        }
        return;
      }

      if (isMounted) {
        setUser(firebaseUser);
      }

      try {
        await ensureUserProfile(firebaseUser);
      } catch (err) {
        console.error('Failed to ensure user profile:', err);
      }

      const userPath = `users/${firebaseUser.uid}`;
      const userRef = doc(db, 'users', firebaseUser.uid);

      unsubDoc = onSnapshot(
        userRef,
        (docSnap) => {
          if (!isMounted) return;
          if (docSnap.exists()) {
            const raw = docSnap.data();
            setUserData({
              uid: raw.uid || firebaseUser.uid,
              email: raw.email || firebaseUser.email || '',
              displayName: raw.displayName || firebaseUser.displayName || 'Usuário',
              photoURL: raw.photoURL || firebaseUser.photoURL || '',
              plan: raw.plan === 'pro' ? 'pro' : 'free',
              role: raw.role === 'admin' ? 'admin' : 'user',
              planType: raw.planType || 'none',
              categories: Array.isArray(raw.categories) && raw.categories.length > 0 ? raw.categories : [...FREE_CATEGORIES],
              usageFile: typeof raw.usageFile === 'number' ? raw.usageFile : 0,
              usageUrl: typeof raw.usageUrl === 'number' ? raw.usageUrl : 0,
              usageText: typeof raw.usageText === 'number' ? raw.usageText : 0,
              createdAt: toMillis(raw.createdAt),
              updatedAt: toMillis(raw.updatedAt),
            });
          }
          setLoading(false);
          setAuthReady(true);
        },
        (error) => {
          setLoading(false);
          setAuthReady(true);
          handleFirestoreError(error, OperationType.GET, userPath);
        }
      );
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const isAdmin = Boolean(
    user &&
      user.emailVerified &&
      (userData?.role === 'admin' || user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL)
  );

  const isPro = userData?.plan === 'pro';

  const createdAtMs = userData?.createdAt || Date.now();
  const elapsedMs = Math.max(0, Date.now() - createdAtMs);
  const isTrialExpired = !isPro && elapsedMs > FREE_TRIAL_MS;
  const trialDaysRemaining = isPro
    ? 7
    : Math.max(0, 7 - Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));

  const checkAndIncrementUsage = useCallback(
    async (source: 'file' | 'url' | 'text'): Promise<UsageCheckResult> => {
      if (!user || !userData) {
        return {
          allowed: false,
          reason: 'AUTH_REQUIRED',
          message: 'Faça login com sua conta Google para continuar.',
        };
      }

      if (isPro) {
        return { allowed: true };
      }

      if (isTrialExpired) {
        return {
          allowed: false,
          reason: 'TRIAL_EXPIRED',
          message:
            'Seu período de teste gratuito de 7 dias encerrou. Assine o Plano Pro para continuar com leituras ilimitadas.',
        };
      }

      const fieldMap = {
        file: 'usageFile',
        url: 'usageUrl',
        text: 'usageText',
      } as const;
      const labelMap = {
        file: 'arquivos',
        url: 'URLs',
        text: 'textos digitados/colados',
      } as const;

      const fieldName = fieldMap[source];
      const currentCount = userData[fieldName] || 0;

      if (currentCount >= FREE_LIMIT_PER_SOURCE) {
        return {
          allowed: false,
          reason: 'LIMIT_REACHED',
          message: `Você atingiu o limite gratuito de ${FREE_LIMIT_PER_SOURCE} leituras para ${labelMap[source]}. Faça upgrade para o Plano Pro para acesso ilimitado.`,
        };
      }

      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          [fieldName]: currentCount + 1,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }

      return { allowed: true };
    },
    [user, userData, isPro, isTrialExpired]
  );

  const adminSetPlanPreview = useCallback(
    async (targetPlan: 'free' | 'pro') => {
      if (!user || !isAdmin) return;
      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          plan: targetPlan,
          planType: targetPlan === 'pro' ? 'lifetime' : 'none',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }
    },
    [user, isAdmin]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        authReady,
        isPro,
        isAdmin,
        trialDaysRemaining,
        isTrialExpired,
        checkAndIncrementUsage,
        adminSetPlanPreview,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
