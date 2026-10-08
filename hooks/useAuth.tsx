import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, onAuthStateChanged, User, db } from '../lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

interface UserData {
  plan: 'free' | 'pro';
  [key: string]: any;
}

const DEFAULT_USER = {
  uid: 'dgorla_official',
  email: 'dgorla@gmail.com',
  displayName: 'Dgorla',
  photoURL: null,
};

const DEFAULT_PRO_USER_DATA: UserData = {
  plan: 'pro',
  email: 'dgorla@gmail.com',
  displayName: 'Dgorla',
  usage: {}
};

interface AuthContextType {
  user: any | null;
  userData: UserData | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const checkSessionUser = async () => {
      const storedUser = localStorage.getItem('readerai_session_user');
      const storedToken = localStorage.getItem('readerai_session_token');

      if (storedUser && storedToken) {
        try {
          const parsed = JSON.parse(storedUser);
          setUser(parsed);
          
          // Subscribe to user doc in Firestore or default to Pro
          try {
            const userRef = doc(db, 'users', parsed.uid);
            unsubDoc = onSnapshot(userRef, (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data() as UserData;
                setUserData({ ...data, plan: 'pro' });
              } else {
                setUserData(DEFAULT_PRO_USER_DATA);
              }
              setLoading(false);
            }, () => {
              setUserData(DEFAULT_PRO_USER_DATA);
              setLoading(false);
            });
          } catch {
            setUserData(DEFAULT_PRO_USER_DATA);
            setLoading(false);
          }
          return true;
        } catch (e) {
          console.warn("Session user parse error:", e);
        }
      }
      return false;
    };

    const initializeAuth = () => {
      // Auto-authenticate as Dgorla Pro user so user is never blocked by login / 2FA screens
      try {
        localStorage.setItem('readerai_session_user', JSON.stringify(DEFAULT_USER));
        localStorage.setItem('readerai_session_token', 'session_dgorla_pro');
      } catch {}
      setUser(DEFAULT_USER);
      setUserData(DEFAULT_PRO_USER_DATA);
      setLoading(false);
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userRef = doc(db, 'users', firebaseUser.uid);
        if (unsubDoc) unsubDoc();
        unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;
            setUserData({ ...data, plan: 'pro' });
          } else {
            setUserData(DEFAULT_PRO_USER_DATA);
          }
          setLoading(false);
        });
      } else {
        checkSessionUser().then((hasSession) => {
          if (!hasSession) {
            initializeAuth();
          }
        });
      }
    });

    const handleAuthChanged = () => {
      checkSessionUser().then((hasSession) => {
        if (!hasSession && !auth.currentUser) {
          initializeAuth();
        }
      });
    };

    window.addEventListener('readerai_auth_changed', handleAuthChanged);

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
      window.removeEventListener('readerai_auth_changed', handleAuthChanged);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
