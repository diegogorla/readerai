import { ExportFormat } from '../types';

// Declare global variables from CDN scripts for TypeScript
declare const mammoth: any;
declare const pdfjsLib: any;
declare const jspdf: any;
declare const html2canvas: any;
declare const htmlToDocx: any;

const libraryConfig = {
  pdfjsLib: { url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.6.347/build/pdf.min.js', globalName: 'pdfjsLib' },
  mammoth: { url: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', globalName: 'mammoth' },
  jspdf: { url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', globalName: 'jspdf' },
  html2canvas: { url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', globalName: 'html2canvas' },
  htmlToDocx: { url: 'https://cdn.jsdelivr.net/npm/html-to-docx@1.8.0/dist/html-to-docx.js', globalName: 'htmlToDocx' },
};

const libraryLoaders: { [key: string]: Promise<void> } = {};

const loadLibrary = (name: keyof typeof libraryConfig): Promise<void> => {
  if (libraryLoaders[name]) {
    return libraryLoaders[name];
  }

  const config = libraryConfig[name];
  if ((window as any)[config.globalName]) {
    return Promise.resolve();
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.url;
    script.crossOrigin = 'anonymous';
    script.async = true;

    script.onload = () => {
      if ((window as any)[config.globalName]) {
        resolve();
      } else {
        reject(new Error(`Library ${name} loaded but global '${config.globalName}' not found.`));
      }
    };

    script.onerror = () => {
      delete libraryLoaders[name];
      reject(new Error(`Library ${name} failed to load. Please check your network connection or ad-blocker.`));
    };

    document.head.appendChild(script);
  });

  libraryLoaders[name] = promise;
  return promise;
};


// --- FILE PARSING ---
const parsePdf = async (file: File): Promise<string> => {
  await loadLibrary('pdfjsLib');
  const pdfjs = (window as any).pdfjsLib;

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@2.6.347/build/pdf.worker.min.js`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.6.347/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.6.347/standard_fonts/',
  }).promise;

  let fullHtml = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    let pageText = '';
    let lastY = -1;
    textContent.items.forEach((item: any) => {
      const currentY = item.transform[5];
      const lineHeight = item.transform[3] || 12;
      if (lastY !== -1) {
          const deltaY = Math.abs(lastY - currentY);
          if (deltaY > 2) {
              if (deltaY > lineHeight * 1.5) { // Likely a paragraph break
                  pageText += '\n\n';
              } else {
                  if (pageText.match(/-\s*$/)) {
                      pageText = pageText.replace(/-\s*$/, '');
                  } else if (!pageText.endsWith(' ') && !item.str.startsWith(' ')) {
                      pageText += ' ';
                  }
              }
          }
      }
      pageText += item.str;
      lastY = currentY;
    });
    
    const paragraphs = pageText.split(/\n{2,}|\s{4,}/).filter(p => p.trim());
    const pageHtml = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    fullHtml += pageHtml;
  }
  return fullHtml;
};

const parseDocx = async (file: File): Promise<string> => {
  await loadLibrary('mammoth');
  const mammothLib = (window as any).mammoth;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammothLib.convertToHtml({ arrayBuffer: arrayBuffer });
  return result.value;
};

const parseTxt = async (file: File): Promise<string> => {
  const text = await file.text();
  return text.split('\n').map(p => `<p>${p}</p>`).join('');
};

const parseHtml = async (file: File): Promise<string> => {
  return await file.text();
};

export const parseFile = async (file: File): Promise<{ content: string; type: 'html' | 'text' }> => {
  const name = file.name || '';
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
  const mimeType = (file.type || '').toLowerCase();
  let content = '';

  if (extension === 'pdf' || mimeType.includes('pdf')) {
    content = await parsePdf(file);
  } else if (
    extension === 'docx' || 
    mimeType.includes('wordprocessingml') || 
    mimeType.includes('msword') || 
    mimeType.includes('officedocument')
  ) {
    content = await parseDocx(file);
  } else if (extension === 'html' || extension === 'htm' || mimeType.includes('html')) {
    content = await parseHtml(file);
  } else if (
    extension === 'txt' || 
    extension === 'md' || 
    extension === 'json' || 
    mimeType.includes('text')
  ) {
    content = await parseTxt(file);
  } else {
    // Fallback: Attempt text parse
    try {
      content = await parseTxt(file);
    } catch {
      throw new Error(`Unsupported file type: ${name || mimeType || 'unknown'}`);
    }
  }

  return { content, type: 'html' };
};

// --- GEMINI API SERVICES (Proxied securely through backend) ---
import { fetchWithAuth } from '../lib/authHelper';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const checkUsageLimit = async (source: 'url' | 'file' | 'text'): Promise<void> => {
  let userUid: string | null = auth.currentUser?.uid || null;
  if (!userUid && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('readerai_session_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        userUid = parsed.uid || null;
      }
    } catch {}
  }

  // If no user is logged in, allow reading as guest
  if (!userUid) {
    return;
  }

  try {
    const userRef = doc(db, 'users', userUid);
    const userDoc = await getDoc(userRef);
    
    let userData = userDoc.exists() ? userDoc.data() : { plan: 'free', usage: {} };
    if (!userData.usage) userData.usage = {};

    if (userData.plan === 'free') {
      const sourceUsage = userData.usage[source] || 0;
      if (sourceUsage >= 3) {
        throw new Error(`Você atingiu o limite gratuito de 3 leituras para a fonte: ${source}. Assine o plano Pro para leituras ilimitadas.`);
      }
      // Increment usage
      await setDoc(userRef, {
        usage: { ...userData.usage, [source]: sourceUsage + 1 }
      }, { merge: true });
    }
  } catch (err: any) {
    if (err.message && err.message.includes('limite gratuito')) {
      throw err;
    }
    console.warn("Usage limit check bypassed:", err);
  }
};


export const fetchAndCleanUrl = async (url: string): Promise<{ content: string; title: string }> => {
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  // 1. Fetch raw web content via local proxy
  const proxyUrl = `/api/fetch-url?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      if (errorData.error) errorMessage = errorData.error;
    } catch (e) {}
    throw new Error(`Não foi possível carregar a URL (${errorMessage}). Verifique se o endereço é público e está correto.`);
  }
  const html = await response.text();

  // 2. Attempt smart cleaning via backend Gemini AI proxy
  try {
    const cleanResponse = await fetchWithAuth('/api/gemini/clean-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });

    if (cleanResponse.ok) {
      const resultJson = await cleanResponse.json();
      if (resultJson.content && resultJson.content.length > 40 && !resultJson.content.includes('Could not extract content')) {
        return {
          content: resultJson.content,
          title: resultJson.title || 'Artigo Web',
        };
      }
    }
  } catch (geminiErr) {
    console.warn("Gemini clean-url error, falling back to local DOMParser:", geminiErr);
  }

  // 3. High-Fidelity Client-side DOMParser Extraction Fallback
  try {
    if (typeof window !== 'undefined' && window.DOMParser) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Strip unnecessary/bloat tags
      const toRemove = doc.querySelectorAll('script, style, svg, noscript, iframe, nav, footer, header, aside, form, .ad, .advertisement, [aria-hidden="true"], button');
      toRemove.forEach(el => el.remove());

      const pageTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                        doc.querySelector('title')?.textContent?.trim() || 
                        doc.querySelector('h1')?.textContent?.trim() || 
                        'Artigo Web';

      // Prioritize article/main semantic tags
      const container = doc.querySelector('article') || 
                        doc.querySelector('main') || 
                        doc.querySelector('[role="main"]') || 
                        doc.querySelector('.article-body, .post-content, .entry-content, #content, .content') || 
                        doc.body;

      const nodes = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote');
      const validHtmlPieces: string[] = [];

      nodes.forEach(node => {
        const text = node.textContent?.trim() || '';
        if (text.length > 20 || ['H1', 'H2', 'H3', 'H4'].includes(node.tagName)) {
          validHtmlPieces.push(node.outerHTML);
        }
      });

      if (validHtmlPieces.length > 0) {
        return {
          content: validHtmlPieces.join('\n'),
          title: pageTitle,
        };
      }

      // Secondary paragraph fallback
      const textLines = (container.textContent || '')
        .split(/\n\s*\n/)
        .map(l => l.trim())
        .filter(l => l.length > 30);

      if (textLines.length > 0) {
        return {
          content: textLines.map(line => `<p>${line}</p>`).join('\n'),
          title: pageTitle,
        };
      }
    }
  } catch (domErr) {
    console.warn("Local DOMParser fallback error:", domErr);
  }

  return {
    content: `<p>Conteúdo da página carregado com sucesso a partir de <a href="${targetUrl}" target="_blank" rel="noopener">${targetUrl}</a>.</p>`,
    title: 'Artigo Web',
  };
};

export const generateNotes = async (htmlContent: string, isSelection: boolean = false): Promise<string> => {
  if (!htmlContent) return '';

  const response = await fetchWithAuth('/api/gemini/generate-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ htmlContent, isSelection }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Falha ao gerar notas' }));
    throw new Error(errorData.error || 'Falha ao gerar notas.');
  }

  const data = await response.json();
  return data.notes || '';
};

export const translateContent = async (
  htmlContent: string,
  targetLanguage: string = 'pt-BR',
  isSelection: boolean = false
): Promise<string> => {
  if (!htmlContent) return '';

  const response = await fetchWithAuth('/api/gemini/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ htmlContent, targetLanguage, isSelection }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Falha ao traduzir conteúdo' }));
    throw new Error(errorData.error || 'Falha ao traduzir conteúdo.');
  }

  const data = await response.json();
  return data.translated || '';
};

// --- CONTENT EXPORTING ---
const downloadFile = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

export const exportContent = async (
    element: HTMLElement,
    format: ExportFormat,
    filename: string,
    commentsContent: string = ''
) => {
    const sanitizedFilename = filename.replace(/[^a-z0-9_.-]/gi, '_');

    switch (format) {
        case 'pdf':
            await Promise.all([loadLibrary('jspdf'), loadLibrary('html2canvas')]);
            const jspdfLib = (window as any).jspdf;
            const html2canvasLib = (window as any).html2canvas;
            const { jsPDF } = jspdfLib;

            const canvas = await html2canvasLib(element, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`${sanitizedFilename}.pdf`);
            break;

        case 'docx':
            await loadLibrary('htmlToDocx');
            const htmlToDocxLib = (window as any).htmlToDocx;
            const docxBlob = await htmlToDocxLib.asBlob(element.innerHTML, {
                orientation: 'portrait',
                margins: { top: 720, right: 720, bottom: 720, left: 720 }
            });
            downloadFile(docxBlob, `${sanitizedFilename}.docx`);
            break;

        case 'txt':
            let textContent = element.innerText;
            if (commentsContent) {
                textContent += `\n\n---\n\nCOMMENTS\n\n${commentsContent}`;
            }
            const txtBlob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            downloadFile(txtBlob, `${sanitizedFilename}.txt`);
            break;
    }
};

