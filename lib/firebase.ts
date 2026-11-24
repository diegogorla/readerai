import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { OpenDocument, Highlight, Comment, ListItem } from '../types';

export const BOOTSTRAP_ADMIN_EMAIL = 'dgorla@gmail.com';
export const FREE_CATEGORIES = ['Geral', 'Leituras & Estudos'] as const;

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function toMillis(value: unknown): number {
  if (!value) return Date.now();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof (value as any).toMillis === 'function') {
    return (value as any).toMillis();
  }
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function ensureUserProfile(firebaseUser: User): Promise<void> {
  const userPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!snap.exists()) {
    const email = (firebaseUser.email || '').trim().toLowerCase().slice(0, 254);
    const isBootstrapAdmin = email === BOOTSTRAP_ADMIN_EMAIL && firebaseUser.emailVerified === true;
    const displayName = (firebaseUser.displayName || email.split('@')[0] || 'Usuário').slice(0, 120);
    const photoURL = (firebaseUser.photoURL || '').slice(0, 1024);

    const payload = {
      uid: sanitizeId(firebaseUser.uid),
      email: firebaseUser.email || '',
      displayName,
      photoURL,
      plan: isBootstrapAdmin ? 'pro' : 'free',
      role: isBootstrapAdmin ? 'admin' : 'user',
      planType: isBootstrapAdmin ? 'lifetime' : 'none',
      categories: [...FREE_CATEGORIES],
      usageFile: 0,
      usageUrl: 0,
      usageText: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  }
}

export const signInWithGoogle = async (): Promise<User> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
    return result.user;
  } catch (error: any) {
    console.error('Error signing in with Google popup:', error);
    if (error?.code === 'auth/popup-blocked') {
      throw new Error('O navegador bloqueou a janela pop-up do Google. Permita pop-ups para este site e tente novamente.');
    }
    if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('Login cancelado. Clique novamente em "Continuar com Google" quando estiver pronto.');
    }
    if (error?.code === 'auth/unauthorized-domain') {
      throw new Error('Este domínio ainda não está autorizado no Firebase Console (Authentication → Settings → Authorized domains).');
    }
    throw error;
  }
};

export const logout = async (): Promise<void> => {
  try {
    localStorage.removeItem('readerai_session_token');
    localStorage.removeItem('readerai_session_user');
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
  }
};

function sanitizeHighlights(highlights: Highlight[]): Highlight[] {
  return (highlights || []).slice(0, 200).map((h) => ({
    id: String(h.id || '').slice(0, 128),
    text: String(h.text || '').slice(0, 2000),
    ...(h.color ? { color: h.color } : {}),
  }));
}

function sanitizeComments(comments: Comment[]): Comment[] {
  return (comments || []).slice(0, 200).map((c) => ({
    id: String(c.id || '').slice(0, 128),
    highlightId: String(c.highlightId || '').slice(0, 128),
    text: String(c.text || '').slice(0, 15000),
    ...(typeof c.createdAt === 'number' ? { createdAt: c.createdAt } : {}),
    ...(typeof c.updatedAt === 'number' ? { updatedAt: c.updatedAt } : {}),
  }));
}

export function buildFirestoreDocumentCreatePayload(userId: string, docData: OpenDocument) {
  const safeId = sanitizeId(docData.id);
  return {
    id: safeId,
    ownerId: sanitizeId(userId),
    title: (docData.title || docData.filename || 'Documento').trim().slice(0, 300) || 'Documento',
    filename: (docData.filename || docData.title || 'documento.html').trim().slice(0, 300) || 'documento.html',
    content: (docData.content || '').slice(0, 250000),
    originalContent: (docData.originalContent || docData.content || '').slice(0, 250000),
    contentType: docData.contentType === 'url' ? 'url' : 'html',
    ...(docData.sourceUrl ? { sourceUrl: String(docData.sourceUrl).slice(0, 2048) } : {}),
    type: docData.type && ['file', 'drive', 'url', 'direct_text'].includes(docData.type) ? docData.type : 'file',
    highlights: sanitizeHighlights(docData.highlights),
    comments: sanitizeComments(docData.comments),
    isMinimized: Boolean(docData.isMinimized),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function buildFirestoreDocumentUpdatePayload(docData: Partial<OpenDocument>) {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof docData.title === 'string') {
    payload.title = docData.title.trim().slice(0, 300) || 'Documento';
  }
  if (typeof docData.content === 'string') {
    payload.content = docData.content.slice(0, 250000);
  }
  if (Array.isArray(docData.highlights)) {
    payload.highlights = sanitizeHighlights(docData.highlights);
  }
  if (Array.isArray(docData.comments)) {
    payload.comments = sanitizeComments(docData.comments);
  }
  if (typeof docData.isMinimized === 'boolean') {
    payload.isMinimized = docData.isMinimized;
  }
  return payload;
}

export function buildFirestoreItemCreatePayload(
  userId: string,
  item: {
    id: string;
    title: string;
    category: string;
    notes?: string;
    hasAlarm?: boolean;
    alarmTime?: string | null;
  }
) {
  const safeId = sanitizeId(item.id);
  const payload: Record<string, unknown> = {
    id: safeId,
    ownerId: sanitizeId(userId),
    title: item.title.trim().slice(0, 300),
    category: (item.category || 'Geral').trim().slice(0, 80) || 'Geral',
    notes: (item.notes || '').trim().slice(0, 2000),
    completed: false,
    hasAlarm: Boolean(item.hasAlarm),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (item.hasAlarm && item.alarmTime) {
    payload.alarmTime = String(item.alarmTime).slice(0, 64);
  }
  return payload;
}

export function mapDocSnapToOpenDocument(id: string, data: Record<string, any>): OpenDocument {
  return {
    id,
    title: data.title || data.filename || 'Documento',
    filename: data.filename || data.title || 'Documento',
    content: data.content || '',
    originalContent: data.originalContent || data.content || '',
    contentType: data.contentType === 'url' ? 'url' : 'html',
    sourceUrl: data.sourceUrl || undefined,
    type: data.type || 'file',
    highlights: Array.isArray(data.highlights) ? data.highlights : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    isMinimized: Boolean(data.isMinimized),
    createdAt: toMillis(data.createdAt),
  };
}

export function mapItemSnapToListItem(id: string, data: Record<string, any>): ListItem {
  return {
    id,
    title: data.title || '',
    category: data.category || 'Geral',
    notes: data.notes || '',
    completed: Boolean(data.completed),
    hasAlarm: Boolean(data.hasAlarm),
    alarmTime: data.alarmTime || undefined,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export { onAuthStateChanged, type User };
