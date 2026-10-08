import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { parseFile } from './api';

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Scopes for Google Drive integration
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

// In-memory token cache (never stored in localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (user && !cachedAccessToken) {
      // User is authenticated in Firebase, but we need fresh Drive token
      if (onAuthFailure) onAuthFailure();
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGoogleDrive = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive access token from sign-in.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const signOutGoogleDrive = async () => {
  await firebaseSignOut(auth);
  cachedAccessToken = null;
};

/**
 * Lists files from user's Google Drive
 */
export const listDriveFiles = async (
  searchTerm: string = '',
  filterType: 'all' | 'docs' | 'pdf' | 'text' = 'all'
): Promise<DriveFile[]> => {
  if (!cachedAccessToken) {
    throw new Error('Please sign in with Google Drive first.');
  }

  let queryParts = ['trashed = false'];

  if (searchTerm.trim()) {
    const escaped = searchTerm.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    queryParts.push(`name contains '${escaped}'`);
  }

  if (filterType === 'docs') {
    queryParts.push("mimeType = 'application/vnd.google-apps.document'");
  } else if (filterType === 'pdf') {
    queryParts.push("mimeType = 'application/pdf'");
  } else if (filterType === 'text') {
    queryParts.push("(mimeType = 'text/plain' or mimeType = 'text/html' or mimeType = 'text/markdown' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')");
  } else {
    // All supported document types
    queryParts.push(
      "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'text/plain' or mimeType = 'text/html' or mimeType = 'text/markdown')"
    );
  }

  const q = queryParts.join(' and ');
  const fields = 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink, webViewLink)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=50&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null;
      throw new Error('Authentication expired. Please sign in again.');
    }
    const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(errorData.error?.message || 'Failed to list Google Drive files.');
  }

  const data = await response.json();
  return data.files || [];
};

/**
 * Downloads / Exports a file from Google Drive and prepares it for Reader AI
 */
export const loadDriveFileContent = async (file: DriveFile): Promise<{ content: string; filename: string }> => {
  if (!cachedAccessToken) {
    throw new Error('Please sign in with Google Drive first.');
  }

  // 1. Google Docs -> Export as HTML
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/html`;
    const response = await fetch(exportUrl, {
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to export Google Doc: ${errText || response.statusText}`);
    }

    const rawHtml = await response.text();
    // Clean up HTML body if it contains full document envelope
    let cleanHtml = rawHtml;
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
      cleanHtml = bodyMatch[1];
    }
    // Remove inline scripts and styles that might alter app layout
    cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleanHtml = cleanHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    return {
      content: cleanHtml.trim() || '<p>No content in document.</p>',
      filename: file.name,
    };
  }

  // 2. Google Presentations (Slides) -> Export as Plain Text
  if (file.mimeType === 'application/vnd.google-apps.presentation') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    const response = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${cachedAccessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to export Google Presentation: ${response.statusText}`);
    }
    const plainText = await response.text();
    const formattedHtml = plainText.split('\n\n').filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('');
    return {
      content: formattedHtml,
      filename: file.name,
    };
  }

  // 3. Binary / Standard Files (PDF, DOCX, TXT, HTML) -> Download media and parse
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(errData.error?.message || `Failed to download file from Google Drive: ${response.statusText}`);
  }

  const blob = await response.blob();
  
  // Guarantee an extension if missing to facilitate parser detection
  let simulatedName = file.name || 'document';
  if (!simulatedName.includes('.')) {
    if (file.mimeType.includes('pdf')) simulatedName += '.pdf';
    else if (file.mimeType.includes('word') || file.mimeType.includes('officedocument')) simulatedName += '.docx';
    else if (file.mimeType.includes('html')) simulatedName += '.html';
    else simulatedName += '.txt';
  }

  const simulatedFile = new File([blob], simulatedName, { type: file.mimeType });
  const parsed = await parseFile(simulatedFile);

  return {
    content: parsed.content,
    filename: file.name,
  };
};

/**
 * Saves current reader text or notes to user's Google Drive
 * Includes required explicit confirmation before executing!
 */
export const saveDocumentToDrive = async (
  fileName: string,
  htmlContent: string,
  format: 'html' | 'txt' = 'html'
): Promise<DriveFile> => {
  if (!cachedAccessToken) {
    throw new Error('Please sign in with Google Drive first.');
  }

  const finalName = fileName.endsWith(`.${format}`) ? fileName : `${fileName}.${format}`;
  const contentType = format === 'html' ? 'text/html' : 'text/plain';

  // Prepare metadata and body for multipart upload
  const metadata = {
    name: finalName,
    mimeType: contentType,
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${contentType}; charset=UTF-8\r\n\r\n` +
    htmlContent +
    closeDelimiter;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(errorData.error?.message || 'Failed to save file to Google Drive.');
  }

  return await response.json();
};
