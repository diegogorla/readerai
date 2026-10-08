import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  signInWithCustomToken, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0154642798",
  appId: "1:519617531356:web:c17b38a56104ed31b01319",
  apiKey: "AIzaSyBk-xLCzHv-Oky96uPbhvP-vE4Dj6vHTog",
  authDomain: "gen-lang-client-0154642798.firebaseapp.com",
  storageBucket: "gen-lang-client-0154642798.firebasestorage.app",
  messagingSenderId: "519617531356",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-readerai-7103f7fb-7765-41b7-b9f1-cf7187ac21ec");

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // Create/update user doc
    const userRef = doc(db, 'users', result.user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        email: result.user.email,
        name: result.user.displayName,
        photoURL: result.user.photoURL,
        plan: 'free',
        categories: ['Geral', 'Leituras & Estudos'],
        createdAt: new Date().toISOString()
      }, { merge: true });
    }
    return result.user;
  } catch (error: any) {
    console.error("Error signing in with Google popup:", error);
    // If popup is blocked by iframe or browser, provide informative error
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/unauthorized-domain') {
      throw new Error("O navegador bloqueou a janela pop-up do Google. Por favor, use o login por código 2FA enviado por e-mail!");
    }
    throw error;
  }
};

// Request a 6-digit 2FA code via backend
export const request2FACode = async (email: string): Promise<{ success: boolean; message: string; devCode?: string }> => {
  const response = await fetch('/api/auth/send-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao solicitar código 2FA.');
  }
  return data;
};

// Verify the 2FA code and sign in using Firebase Custom Token or Session Token
export const signInWith2FACode = async (email: string, code: string): Promise<any> => {
  const response = await fetch('/api/auth/verify-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Código 2FA inválido ou expirado.');
  }

  if (data.sessionToken) {
    localStorage.setItem('readerai_session_token', data.sessionToken);
    localStorage.setItem('readerai_session_user', JSON.stringify(data.user));
    window.dispatchEvent(new Event('readerai_auth_changed'));
  }

  if (data.customToken) {
    try {
      const userCredential = await signInWithCustomToken(auth, data.customToken);
      return userCredential.user;
    } catch (e) {
      console.warn("Client signInWithCustomToken fallback to session:", e);
    }
  }

  return data.user;
};

export const logout = async () => {
  try {
    localStorage.removeItem('readerai_session_token');
    localStorage.removeItem('readerai_session_user');
    window.dispatchEvent(new Event('readerai_auth_changed'));
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export { onAuthStateChanged, type User, signInWithCustomToken };
