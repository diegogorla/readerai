import { auth } from './firebase';

export const getAuthToken = async (): Promise<string | null> => {
  if (auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken();
    } catch (e) {
      console.warn("Failed to get Firebase ID token:", e);
    }
  }
  const sessionToken = localStorage.getItem('readerai_session_token');
  if (sessionToken) {
    return sessionToken;
  }
  return null;
};

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = await getAuthToken();
  if (token) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
  }
  return fetch(url, options);
};
