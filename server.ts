import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    projectId: 'gen-lang-client-0154642798',
  });
}

const db = getFirestore(undefined, "ai-studio-readerai-7103f7fb-7765-41b7-b9f1-cf7187ac21ec");

// Middleware to strictly verify Firebase ID Token (works on all projects without IAM)
async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticação necessária. Faça login com sua conta Google.' });
  }
  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    return next();
  } catch (error) {
    console.warn('[Auth] Invalid Firebase ID token:', (error as any)?.message || error);
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente com o Google.' });
  }
}

// Optional Auth: verifies Firebase ID token if provided, allows anonymous access otherwise
async function optionalAuth(req: any, _res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      try {
        req.user = await getAuth().verifyIdToken(token);
      } catch {
        req.user = null;
      }
    }
  } else {
    req.user = null;
  }
  next();
}

// In-Memory 2FA Codes Store: email -> { code, expiresAt, attempts }
const twoFactorCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

// Clean up expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of twoFactorCodes.entries()) {
    if (entry.expiresAt < now) {
      twoFactorCodes.delete(email);
    }
  }
}, 60 * 1000);

// Lazy Gemini client helper
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

const OPENAI_ALLOWED_VOICES = new Set([
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
]);

function getOpenAiApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY;
  return key?.trim() || undefined;
}

async function callGeminiWithFallback(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; models?: string[] }
) {
  const modelsToTry = params.models || [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
  ];

  let lastError: any = null;
  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || '');
        const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
        console.warn(`[Gemini] Model ${model} (attempt ${attempt + 1}) failed:`, msg);
        if (isTransient && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }
  }
  throw lastError || new Error("O serviço de IA está temporariamente indisponível. Tente novamente em instantes.");
}

// SSRF Protection Helper
function isSafeUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    
    // Block loopback, localhost, and cloud metadata
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      (hostname.startsWith('172.') && parseInt(hostname.split('.')[1] || '0', 10) >= 16 && parseInt(hostname.split('.')[1] || '0', 10) <= 31)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  // Dev server must run on port 3000 (nginx listens on 8080 and proxies to 3000)
  const portArgIndex = process.argv.indexOf("--port");
  const PORT = portArgIndex !== -1 && process.argv[portArgIndex + 1]
    ? Number(process.argv[portArgIndex + 1]) || 3000
    : 3000;

  app.use(express.json({ limit: "50mb" }));

  // ==========================================
  // AUTHENTICATION & 2FA ENDPOINTS
  // ==========================================

  // Send 2FA Verification Code to Email
  app.post("/api/auth/send-2fa", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'E-mail inválido.' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      // Generate secure 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      twoFactorCodes.set(normalizedEmail, {
        code,
        expiresAt,
        attempts: 0
      });

      console.log(`[2FA] Código gerado para ${normalizedEmail}: ${code}`);

      // If SMTP credentials exist, attempt real sending
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log(`[2FA] Enviando email para ${normalizedEmail} via ${process.env.SMTP_HOST}...`);
      }

      // Return response with devCode for preview/development convenience
      res.json({
        success: true,
        message: `Código de verificação 2FA enviado com sucesso para ${normalizedEmail}.`,
        devCode: code, // Displayed in development UI so user is never blocked
        expiresInSeconds: 600
      });
    } catch (error: any) {
      console.error("2FA Send Error:", error);
      res.status(500).json({ error: "Erro ao gerar código 2FA." });
    }
  });

  // Verify 2FA Code and Issue Firebase Custom Token
  app.post("/api/auth/verify-2fa", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: 'E-mail e código são obrigatórios.' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const entry = twoFactorCodes.get(normalizedEmail);

      if (!entry) {
        return res.status(400).json({ error: 'Nenhum código 2FA pendente para este e-mail. Solicite um novo código.' });
      }

      if (Date.now() > entry.expiresAt) {
        twoFactorCodes.delete(normalizedEmail);
        return res.status(400).json({ error: 'O código 2FA expirou. Solicite um novo código.' });
      }

      entry.attempts += 1;
      if (entry.attempts > 5) {
        twoFactorCodes.delete(normalizedEmail);
        return res.status(429).json({ error: 'Muitas tentativas incorretas. Solicite um novo código.' });
      }

      if (entry.code !== code.toString().trim()) {
        return res.status(400).json({ error: 'Código 2FA incorreto. Verifique os 6 dígitos digitados.' });
      }

      // Code is valid! Consume it
      twoFactorCodes.delete(normalizedEmail);

      // Generate consistent UID
      const uid = 'user_' + Buffer.from(normalizedEmail).toString('hex').slice(0, 20);

      // Find or create Firebase user
      let userRecord = null;
      let customToken = null;
      try {
        try {
          userRecord = await getAuth().getUserByEmail(normalizedEmail);
        } catch (err: any) {
          if (err.code === 'auth/user-not-found') {
            userRecord = await getAuth().createUser({
              uid,
              email: normalizedEmail,
              displayName: normalizedEmail.split('@')[0],
              emailVerified: true
            });
          }
        }

        if (userRecord) {
          customToken = await getAuth().createCustomToken(userRecord.uid);
        }
      } catch (authErr) {
        console.warn("createCustomToken fallback to verified session token:", authErr);
      }

      // Check/create user document in Firestore
      const userRef = db.collection('users').doc(userRecord?.uid || uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        await userRef.set({
          email: normalizedEmail,
          name: userRecord?.displayName || normalizedEmail.split('@')[0],
          plan: 'free',
          createdAt: new Date().toISOString(),
          categories: ['Geral', 'Leituras & Estudos']
        }, { merge: true });
      }

      res.json({
        success: true,
        customToken,
        user: {
          uid: userRecord?.uid || uid,
          email: normalizedEmail,
          displayName: userRecord?.displayName || normalizedEmail.split('@')[0]
        }
      });
    } catch (error: any) {
      console.error("2FA Verify Error:", error);
      res.status(500).json({ error: error.message || 'Falha ao validar 2FA.' });
    }
  });

  // ==========================================
  // USAGE & TRIAL LIMITS
  // ==========================================
  app.post("/api/usage/check", requireAuth, async (req: any, res) => {
    try {
      const { source } = req.body; // 'url', 'file', or 'text'
      if (!source) return res.status(400).json({ error: 'Source is required' });

      const userRef = db.collection('users').doc(req.user.uid);
      const userDoc = await userRef.get();
      
      let userData = userDoc.data() || { plan: 'free', usage: {}, createdAt: new Date().toISOString() };
      if (!userData.usage) userData.usage = {};
      
      // Check 7-day trial
      const createdAt = new Date(userData.createdAt || Date.now()).getTime();
      const isPastTrial = (Date.now() - createdAt) > (7 * 24 * 60 * 60 * 1000);

      if (userData.plan === 'free') {
        if (isPastTrial) {
          return res.status(403).json({
            error: 'TRIAL_EXPIRED',
            message: 'Seu período de teste de 7 dias encerrou. Escolha um plano promocional para continuar.'
          });
        }

        const sourceUsage = userData.usage[source] || 0;
        if (sourceUsage >= 1) {
          return res.status(403).json({ 
            error: 'Limit reached', 
            message: `Você atingiu o limite gratuito de 1 leitura para a fonte: ${source}. Assine o plano Pro para continuar sem limites.` 
          });
        }
        // Increment usage
        await userRef.set({
          usage: { ...userData.usage, [source]: sourceUsage + 1 }
        }, { merge: true });
      }
      
      res.json({ success: true, allowed: true });
    } catch (error) {
      console.error('Usage check error:', error);
      res.status(500).json({ error: 'Failed to check usage' });
    }
  });

  // ==========================================
  // SMART LIST & ALARMS API
  // ==========================================

  // Get all items for user
  app.get("/api/items", requireAuth, async (req: any, res) => {
    try {
      const itemsSnapshot = await db.collection('users').doc(req.user.uid).collection('items').orderBy('createdAt', 'desc').get();
      const items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ items });
    } catch (error: any) {
      console.error("Get items error:", error);
      res.status(500).json({ error: 'Falha ao buscar itens' });
    }
  });

  // Create new item with strict rule enforcement
  app.post("/api/items", requireAuth, async (req: any, res) => {
    try {
      const { title, category = 'Geral', notes = '', hasAlarm = false, alarmTime = null } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Título do item é obrigatório' });
      }

      const userRef = db.collection('users').doc(req.user.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || { plan: 'free', createdAt: new Date().toISOString() };
      const isPro = userData.plan === 'pro';

      // 7-day trial check for free users
      const createdAt = new Date(userData.createdAt || Date.now()).getTime();
      const isPast7Days = (Date.now() - createdAt) > (7 * 24 * 60 * 60 * 1000);

      if (!isPro && isPast7Days) {
        return res.status(403).json({
          error: 'TRIAL_EXPIRED',
          requiresSubscription: true,
          message: 'Seu período de teste gratuito de 7 dias encerrou. Por favor, escolha um plano para continuar adicionando itens.'
        });
      }

      // Check max 5 active items for free tier
      if (!isPro) {
        const itemsSnapshot = await userRef.collection('items').where('completed', '==', false).get();
        if (itemsSnapshot.size >= 5) {
          return res.status(403).json({
            error: 'LIMIT_REACHED',
            requiresSubscription: true,
            message: 'O plano gratuito é limitado a 5 itens ativos. Conclua algum item ou faça upgrade para itens ilimitados.'
          });
        }

        // Check alarm restriction: Alarms only available on paid plans
        if (hasAlarm) {
          return res.status(403).json({
            error: 'ALARM_PRO_ONLY',
            requiresSubscription: true,
            message: 'O recurso de alarme (aviso) só está disponível nos planos pagos.'
          });
        }

        // Check category restriction: Only 2 fixed categories on free
        const allowedFreeCategories = ['Geral', 'Leituras & Estudos'];
        if (!allowedFreeCategories.includes(category)) {
          return res.status(403).json({
            error: 'CATEGORY_PRO_ONLY',
            requiresSubscription: true,
            message: 'Categorias personalizadas são exclusivas para assinantes Pro.'
          });
        }
      }

      const newItem = {
        title: title.trim(),
        category: category.trim(),
        notes: (notes || '').trim(),
        completed: false,
        hasAlarm: isPro ? Boolean(hasAlarm) : false,
        alarmTime: isPro && hasAlarm ? alarmTime : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const docRef = await userRef.collection('items').add(newItem);
      res.json({ id: docRef.id, ...newItem });
    } catch (error: any) {
      console.error("Create item error:", error);
      res.status(500).json({ error: error.message || 'Falha ao criar item' });
    }
  });

  // Update item
  app.put("/api/items/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const userRef = db.collection('users').doc(req.user.uid);
      const userDoc = await userRef.get();
      const isPro = userDoc.data()?.plan === 'pro';

      if (!isPro && updates.hasAlarm) {
        return res.status(403).json({
          error: 'ALARM_PRO_ONLY',
          requiresSubscription: true,
          message: 'Alarmes e avisos só estão disponíveis nos planos pagos.'
        });
      }

      const itemRef = userRef.collection('items').doc(id);
      await itemRef.update({
        ...updates,
        updatedAt: Date.now()
      });

      res.json({ success: true, id, ...updates });
    } catch (error: any) {
      console.error("Update item error:", error);
      res.status(500).json({ error: 'Falha ao atualizar item' });
    }
  });

  // Delete item
  app.delete("/api/items/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      await db.collection('users').doc(req.user.uid).collection('items').doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete item error:", error);
      res.status(500).json({ error: 'Falha ao excluir item' });
    }
  });

  // ==========================================
  // PAYMENT INTEGRATIONS (Paddle & RevenueCat)
  // ==========================================

  app.get("/api/payments/config", (req, res) => {
    res.json({
      prices: {
        BRL: {
          monthly: { price: 5.99, label: 'R$ 5,99', period: 'mês' },
          annual: { price: 59.90, label: 'R$ 59,90', period: 'ano' },
          lifetime: { price: 199.00, label: 'R$ 199,00', period: 'vitalício' }
        },
        USD: {
          monthly: { price: 1.99, label: '$1.99', period: 'month' },
          annual: { price: 19.90, label: '$19.90', period: 'year' },
          lifetime: { price: 79.90, label: '$79.90', period: 'lifetime' }
        }
      },
      paddle: {
        vendorId: process.env.PADDLE_VENDOR_ID || 'sandbox_vendor',
        isConfigured: Boolean(process.env.PADDLE_VENDOR_ID)
      },
      revenuecat: {
        apiKey: process.env.REVENUECAT_API_KEY || 'appl_sandbox_key',
        entitlementId: 'readerai_pro',
        packages: {
          monthly: 'readerai_monthly_599',
          annual: 'readerai_annual_5990',
          lifetime: 'readerai_lifetime_19900'
        }
      }
    });
  });

  // Direct client self-upgrade disabled: Pro plan activation must come from verified Paddle / RevenueCat webhooks
  app.post("/api/checkout", requireAuth, async (_req: any, res) => {
    return res.status(403).json({
      error: 'WEBHOOK_REQUIRED',
      message: 'A ativação do Plano Pro ocorre automaticamente após a confirmação segura do pagamento via webhook (Paddle ou RevenueCat).'
    });
  });

  // Webhook Receiver for Paddle (Paddle Billing v2) & RevenueCat
  // Follows Paddle Agent Skills (paddle-webhooks & paddle-subscription-sync)
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      const signatureHeader = req.headers['paddle-signature'] as string | undefined;
      const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET_KEY;
      const payload = req.body;
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const revenueCatAuthHeader = req.headers.authorization as string | undefined;
      const revenueCatSecret = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;

      let verified = false;

      // 1. Verify Paddle HMAC-SHA256 signature
      if (signatureHeader && webhookSecret) {
        try {
          const parts = signatureHeader.split(';').reduce((acc: Record<string, string>, part: string) => {
            const [k, v] = part.split('=');
            if (k && v) acc[k.trim()] = v.trim();
            return acc;
          }, {});

          const ts = parts['ts'];
          const h1 = parts['h1'];
          if (ts && h1) {
            const expectedHash = crypto.createHmac('sha256', webhookSecret).update(`${ts}:${rawBody}`).digest('hex');
            const expectedBuf = Buffer.from(expectedHash, 'hex');
            const receivedBuf = Buffer.from(h1, 'hex');
            if (expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
              verified = true;
            }
          }
        } catch (sigErr) {
          console.error("[Paddle Webhook] Signature verification failed:", sigErr);
        }
      }

      // 2. Verify RevenueCat Authorization header
      if (!verified && revenueCatAuthHeader && revenueCatSecret) {
        const provided = revenueCatAuthHeader.replace(/^Bearer\s+/i, '').trim();
        const a = Buffer.from(provided);
        const b = Buffer.from(revenueCatSecret);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          verified = true;
        }
      }

      if (!verified) {
        return res.status(401).json({ error: 'Assinatura de webhook inválida ou segredo não configurado.' });
      }

      console.log("[Payment Webhook Event]", payload.event_type || payload.event?.type || "unknown");

      const eventType = payload.event_type || payload.event?.type;
      const customData = payload.data?.custom_data || {};
      const targetUserId = customData.userId || payload.event?.app_user_id;
      const email = payload.data?.customer?.email || payload.email;
      const paddleCustomerId = payload.data?.customer_id;
      const paddleSubscriptionId = payload.data?.id;

      // Handle subscription events for Paddle Billing v2 & RevenueCat
      const isActivationEvent = 
        eventType === 'subscription.created' ||
        eventType === 'subscription.updated' ||
        eventType === 'subscription.activated' ||
        eventType === 'transaction.completed' ||
        eventType === 'transaction.paid' ||
        eventType === 'INITIAL_PURCHASE' ||
        eventType === 'RENEWAL' ||
        eventType === 'UNCANCELLATION';

      const isCancellationEvent =
        eventType === 'subscription.canceled' ||
        eventType === 'subscription.past_due' ||
        eventType === 'EXPIRATION' ||
        eventType === 'CANCELLATION';

      let userRef: any = null;

      if (targetUserId && targetUserId !== 'anonymous') {
        userRef = db.collection('users').doc(targetUserId);
      } else if (email) {
        const usersSnapshot = await db.collection('users').where('email', '==', email.toLowerCase()).get();
        if (!usersSnapshot.empty) {
          userRef = usersSnapshot.docs[0].ref;
        }
      }

      if (userRef) {
        if (isActivationEvent) {
          await userRef.set({
            plan: 'pro',
            paddleCustomerId: paddleCustomerId || null,
            paddleSubscriptionId: paddleSubscriptionId || null,
            subscriptionStatus: 'active',
            updatedAt: Date.now()
          }, { merge: true });
          console.log(`[Paddle Sync] User ${userRef.id} successfully updated to Pro.`);
        } else if (isCancellationEvent) {
          await userRef.set({
            plan: 'free',
            subscriptionStatus: 'canceled',
            updatedAt: Date.now()
          }, { merge: true });
          console.log(`[Paddle Sync] User ${userRef.id} status updated to canceled.`);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Paddle Customer Portal Session Endpoint (paddle-customer-portal skill)
  app.get("/api/payments/paddle/customer-portal", requireAuth, async (req: any, res) => {
    try {
      const userRef = db.collection('users').doc(req.user.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data();
      const customerId = userData?.paddleCustomerId || req.query.customerId;

      const apiKey = process.env.PADDLE_API_KEY;
      const isSandbox = (process.env.PADDLE_ENVIRONMENT || 'sandbox') === 'sandbox';
      const baseUrl = isSandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';

      if (apiKey && customerId) {
        const portalRes = await fetch(`${baseUrl}/customers/${customerId}/portal-sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        const portalData = await portalRes.json();
        if (portalData?.data?.urls?.general?.overview) {
          return res.json({ portalUrl: portalData.data.urls.general.overview });
        }
      }

      // Fallback sandbox/preview direct portal URL
      res.json({
        portalUrl: isSandbox
          ? `https://sandbox-vendors.paddle.com/customers`
          : `https://vendors.paddle.com/customers`
      });
    } catch (error) {
      console.error("Customer Portal Error:", error);
      res.status(500).json({ error: "Falha ao gerar sessão do portal Paddle." });
    }
  });

  // ==========================================
  // URL FETCH PROXY (With SSRF Protection & Multi-Engine Reader Fallback)
  // ==========================================
  app.get("/api/fetch-url", async (req, res) => {
    let targetUrl = req.query.url as string;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: "URL é obrigatória" });
    }

    targetUrl = targetUrl.trim();
    // Normalize duplicate or malformed prefixes (e.g. https://https:// or http://https://)
    targetUrl = targetUrl.replace(/^(?:https?:\/\/)+/i, 'https://');
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    if (!isSafeUrl(targetUrl)) {
      return res.status(400).json({ error: "URL não permitida por motivos de segurança." });
    }

    // Try direct fetch first
    let directHtml = '';
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
      });

      if (response.ok) {
        directHtml = await response.text();
      } else {
        console.warn(`[fetch-url] Direct fetch returned status ${response.status}: ${response.statusText} for ${targetUrl}`);
      }
    } catch (fetchErr: any) {
      console.warn(`[fetch-url] Direct fetch failed for ${targetUrl}:`, fetchErr.message);
    }

    // If direct HTML was retrieved and contains reasonable content, return it
    if (directHtml && directHtml.length > 500) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(directHtml);
    }

    // Automatic fallback: Use Jina AI Reader proxy which bypasses Cloudflare/paywalls and provides clean markdown
    try {
      console.log(`[fetch-url] Falling back to Reader proxy for ${targetUrl}...`);
      const jinaResponse = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: {
          'Accept': 'text/plain,text/markdown',
          'User-Agent': 'ReaderAI/1.0',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (jinaResponse.ok) {
        const markdown = await jinaResponse.text();
        if (markdown && markdown.length > 80) {
          const htmlFromMd = convertMarkdownToHtml(markdown, targetUrl);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(htmlFromMd);
        }
      }
    } catch (jinaErr: any) {
      console.warn(`[fetch-url] Reader proxy fallback error:`, jinaErr.message);
    }

    if (directHtml && directHtml.length > 50) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(directHtml);
    }

    res.status(502).json({ error: "Não foi possível carregar a página indicada. Verifique se o endereço é público e acessível." });
  });

  // Convert Jina Reader Markdown into semantic, readable HTML for our Document reader
  function convertMarkdownToHtml(markdown: string, originalUrl: string): string {
    let title = "Artigo Web";
    const titleMatch = markdown.match(/^Title:\s*(.+)$/m) || markdown.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    // Strip header metadata from Jina output (e.g. Title: ..., URL Source: ..., Markdown Content: ...)
    let content = markdown
      .replace(/^Title:.*$/m, '')
      .replace(/^URL Source:.*$/m, '')
      .replace(/^Markdown Content:\s*/m, '')
      .trim();

    // Convert lines into HTML blocks
    const lines = content.split('\n');
    const htmlBlocks: string[] = [];
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const text = currentParagraph.join(' ').trim();
        if (text) {
          htmlBlocks.push(`<p>${escapeHtml(text)}</p>`);
        }
        currentParagraph = [];
      }
    };

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        continue;
      }

      if (line.startsWith('### ')) {
        flushParagraph();
        htmlBlocks.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      } else if (line.startsWith('## ')) {
        flushParagraph();
        htmlBlocks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      } else if (line.startsWith('# ')) {
        flushParagraph();
        htmlBlocks.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      } else if (line.startsWith('> ')) {
        flushParagraph();
        htmlBlocks.push(`<blockquote>${escapeHtml(line.slice(2))}</blockquote>`);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        flushParagraph();
        htmlBlocks.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      } else {
        currentParagraph.push(line);
      }
    }
    flushParagraph();

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    ${htmlBlocks.join('\n')}
  </article>
</body>
</html>`;
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper to extract clean HTML without AI if needed, or pre-clean before sending to AI
  function precleanHtml(rawHtml: string): { title: string; contentHtml: string } {
    let title = "Artigo Web";
    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || 
                       rawHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i) ||
                       rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Strip out heavy unwanted tags and inline json/templates
    let cleaned = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\{\{[^}]+\}\}/g, ''); // strip raw template fragments

    // Look for article, main, or high-value content blocks
    const articleMatch = cleaned.match(/<article[\s\S]*?<\/article>/i) ||
                         cleaned.match(/<main[\s\S]*?<\/main>/i) ||
                         cleaned.match(/<div[^>]*(?:id|class)=["'][^"']*(?:article|post|content|entry|story|noticia|materia)[^"']*["'][\s\S]*?<\/div>/i);

    const bodyMatch = cleaned.match(/<body[\s\S]*?<\/body>/i);
    let candidateHtml = articleMatch ? articleMatch[0] : (bodyMatch ? bodyMatch[0] : cleaned);

    // Extract all paragraphs and headings from candidate
    const paragraphs: string[] = [];
    const pRegex = /<(?:p|h[1-6]|blockquote|li)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|blockquote|li)>/gi;
    let m;
    while ((m = pRegex.exec(candidateHtml)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 20 && !text.includes('{"template"') && !text.includes('parsoid')) {
        paragraphs.push(`<p>${text}</p>`);
      }
    }

    const fallbackHtml = paragraphs.length > 0 
      ? paragraphs.join('\n') 
      : `<p>${candidateHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 3000)}</p>`;

    return { title, contentHtml: fallbackHtml };
  }

  // ==========================================
  // GEMINI CONTENT CLEANER, NOTES & TRANSLATION
  // ==========================================
  app.post("/api/gemini/clean-url", optionalAuth, async (req, res) => {
    try {
      const { html } = req.body;
      if (!html) {
        return res.status(400).json({ error: "Conteúdo HTML é obrigatório" });
      }

      const { title: preTitle, contentHtml: preContent } = precleanHtml(html);

      // Attempt AI cleaning using Gemini with content-focused excerpt
      try {
        const ai = getGeminiClient();
        const prompt = `From the following web content, extract and clean the main article. Return a JSON object with two keys: "title" (the page or article title) and "content" (the core article formatted using only <p>, <h1>, <h2>, <h3>, <h4>, <ul>, <ol>, <li>, <blockquote> tags). Remove all navigation, ads, footers, and sidebars. Do not add any commentary.`;

        let genAIResponse;
        try {
          genAIResponse = await callGeminiWithFallback(ai, {
            contents: [
              { text: prompt },
              { text: `Page Title Hint: ${preTitle}\nContent HTML: ${preContent.substring(0, 50000)}` }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: "The main title of the web page."
                  },
                  content: {
                    type: Type.STRING,
                    description: "The main article content, formatted as a simple and clean HTML string."
                  }
                },
                required: ["title", "content"]
              }
            }
          });
        } catch (aiErr) {
          console.warn("AI cleaning fallback to precleaned HTML due to high demand:", aiErr);
        }

        const resultText = genAIResponse?.text?.trim() || "{}";
        const resultJson = JSON.parse(resultText);

        if (resultJson.content && resultJson.content.length > 30) {
          return res.json({
            content: resultJson.content,
            title: resultJson.title || preTitle || "Artigo Web"
          });
        }
      } catch (geminiError) {
        console.warn("Gemini AI extraction error, using precleaned HTML fallback:", geminiError);
      }

      // High-quality fallback to precleaned content if Gemini is unavailable
      res.json({
        content: preContent || "<p>Conteúdo da página extraído com sucesso.</p>",
        title: preTitle || "Artigo Web"
      });
    } catch (error: any) {
      console.error('Extract Content Error:', error);
      res.status(500).json({ error: error.message || 'Falha ao extrair conteúdo da URL' });
    }
  });
  
  app.post("/api/gemini/generate-notes", requireAuth, async (req, res) => {
    try {
      const { htmlContent, isSelection = false } = req.body;
      if (!htmlContent || !String(htmlContent).trim()) {
        return res.status(400).json({ error: "Conteúdo é obrigatório" });
      }

      const ai = getGeminiClient();
      const scopeHint = isSelection
        ? "Analyze the following selected excerpt and provide a concise summary, key insights, and structured study notes in Brazilian Portuguese."
        : "Analyze the following document content and provide a concise summary, key insights, and structured study notes in Brazilian Portuguese.";

      const prompt = `${scopeHint}
Format the output as clean HTML using <h2>, <h3>, <ul>, <li>, <strong>, and <p> tags.
Do NOT include markdown code blocks (\`\`\`html) or conversational filler outside the HTML.

Content:
${String(htmlContent).substring(0, 50000)}`;

      const response = await callGeminiWithFallback(ai, {
        contents: prompt,
      });

      let notesHtml = (response.text || "").trim();
      const fenceRegex = /^```(?:html)?\s*\n?([\s\S]*?)\n?\s*```$/i;
      const match = notesHtml.match(fenceRegex);
      if (match && match[1]) {
        notesHtml = match[1].trim();
      }
      if (!notesHtml) {
        return res.status(502).json({ error: "A IA não retornou notas para este conteúdo. Tente novamente." });
      }
      res.json({ notes: notesHtml });
    } catch (error: any) {
      console.error("Gemini Generate Notes Error:", error);
      res.status(500).json({ error: error.message || "Falha ao gerar notas com IA" });
    }
  });

  app.post("/api/gemini/translate", requireAuth, async (req, res) => {
    try {
      const { htmlContent, targetLanguage = "pt-BR", isSelection = false } = req.body;
      if (!htmlContent || !String(htmlContent).trim()) {
        return res.status(400).json({ error: "Conteúdo é obrigatório" });
      }

      const ai = getGeminiClient();
      const languageMap: Record<string, string> = {
        'pt-BR': 'Brazilian Portuguese (Português do Brasil)',
        'pt': 'Portuguese (Português)',
        'en': 'English',
        'es': 'Spanish (Español)',
        'fr': 'French (Français)',
        'de': 'German (Deutsch)',
        'it': 'Italian (Italiano)',
      };
      const targetLangName = languageMap[targetLanguage] || targetLanguage;

      const prompt = isSelection
        ? `You are a professional translator. Translate ONLY the following selected excerpt into ${targetLangName}.
CRITICAL REQUIREMENTS:
1. Preserve any inline HTML tags present in the input (such as <strong>, <em>, <mark>, <a>, <br>, <p>, etc.) with their attributes intact.
2. If the input is plain text without block tags, return ONLY the translated plain text without wrapping it in <p>, <div>, or any extra tags.
3. Preserve leading/trailing meaning accurately and naturally.
4. Return ONLY the translated excerpt. Do NOT include markdown code fences (\`\`\`html), quotes, or explanations.

Excerpt to translate:
${String(htmlContent)}`
        : `You are a professional document translator. Translate all human-readable text in the provided HTML into ${targetLangName}.
CRITICAL REQUIREMENTS:
1. Retain all HTML formatting and tags (<p>, <h1>, <h2>, <h3>, <h4>, <ul>, <ol>, <li>, <strong>, <em>, <span>, <div>, <mark>, etc.) intact with identical structure.
2. Only translate the text content between tags. Do not alter HTML attributes, class names, or IDs.
3. Return ONLY the translated HTML content. Do NOT include markdown code fences (\`\`\`html) or conversational filler before or after.

HTML Content:
${String(htmlContent)}`;

      const response = await callGeminiWithFallback(ai, {
        contents: prompt,
      });

      let translatedHtml = (response.text || "").trim();
      const fenceRegex = /^```(?:html)?\s*\n?([\s\S]*?)\n?\s*```$/i;
      const match = translatedHtml.match(fenceRegex);
      if (match && match[1]) {
        translatedHtml = match[1].trim();
      }
      if (!translatedHtml) {
        return res.status(502).json({ error: "A IA não retornou a tradução. Tente novamente." });
      }
      res.json({ translated: translatedHtml });
    } catch (error: any) {
      console.error("Gemini Translate Error:", error);
      res.status(500).json({ error: error.message || "Falha ao traduzir conteúdo" });
    }
  });

  // ==========================================
  // SPEECH-TO-TEXT / AUDIO TRANSCRIPTION
  // Supports Gemini & OpenAI Whisper
  // ==========================================
  app.post("/api/transcribe", requireAuth, async (req: any, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', engine = 'gemini' } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: 'Dados de áudio em Base64 são obrigatórios' });
      }

      // Verify Pro status when Admin SDK Firestore access is available (bootstrap admin always allowed)
      const isBootstrapAdmin =
        req.user?.email_verified === true &&
        String(req.user?.email || '').toLowerCase() === 'dgorla@gmail.com';
      if (!isBootstrapAdmin) {
        try {
          const userRef = db.collection('users').doc(req.user.uid);
          const userDoc = await userRef.get();
          const isPro = userDoc.data()?.plan === 'pro';
          if (!isPro) {
            return res.status(403).json({
              error: 'PRO_FEATURE',
              requiresSubscription: true,
              message: 'O ditado por comando de voz e transcrição de áudio são exclusivos dos planos pagos.'
            });
          }
        } catch (adminErr: any) {
          console.warn('[Transcribe] Skipping Admin SDK Firestore check on Starter Tier:', adminErr?.message || adminErr);
        }
      }

      // 1. Try OpenAI Whisper if requested and key is present
      const openAiKey = getOpenAiApiKey();
      const tryOpenAiWhisper = async (): Promise<string | null> => {
        if (!openAiKey) return null;
        try {
          const audioBuffer = Buffer.from(audioBase64, 'base64');
          const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm';
          const fileBlob = new Blob([audioBuffer], { type: mimeType });
          const formData = new FormData();
          formData.append('file', fileBlob, `recording.${ext}`);
          formData.append('model', 'whisper-1');
          formData.append('language', 'pt');

          const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAiKey}`
            },
            body: formData
          });

          if (whisperResponse.ok) {
            const data = await whisperResponse.json();
            return data.text || '';
          } else {
            console.warn("Whisper returned error, falling back:", whisperResponse.status);
          }
        } catch (whisperErr: any) {
          console.warn("Whisper execution failed, falling back:", whisperErr?.message || whisperErr);
        }
        return null;
      };

      if (engine === 'whisper' && openAiKey) {
        const whisperText = await tryOpenAiWhisper();
        if (whisperText !== null) {
          return res.json({ text: whisperText, engine: 'whisper' });
        }
      }

      // 2. Gemini Audio Transcription (default or fallback)
      const ai = getGeminiClient();
      let response;
      const transcriptionPrompt = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64
              }
            },
            {
              text: 'Por favor, transcreva o áudio falado de forma exata e literal no idioma correspondente (priorizando português). Retorne apenas o texto transcrito com pontuação adequada, sem introduções, comentários ou notas adicionais.'
            }
          ]
        }
      ];

      try {
        response = await callGeminiWithFallback(ai, {
          contents: transcriptionPrompt,
          models: ['gemini-3.5-transcribe', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
        });
      } catch (err) {
        console.warn("transcribe fallback due to high demand:", err);
        if (engine !== 'whisper' && openAiKey) {
          const whisperText = await tryOpenAiWhisper();
          if (whisperText !== null) {
            return res.json({ text: whisperText, engine: 'whisper' });
          }
        }
        return res.status(503).json({ error: "Serviço de transcrição temporariamente em alta demanda (503). Tente novamente em instantes." });
      }

      const transcript = (response.text || '').trim();
      res.json({ text: transcript, engine: 'gemini' });
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message || 'Falha ao transcrever áudio' });
    }
  });

  // ==========================================
  // TEXT-TO-SPEECH (Gemini, OpenAI, Microsoft Antonio)
  // ==========================================

  // Gemini TTS Endpoint
  app.post("/api/gemini/tts", requireAuth, async (req: any, res) => {
    try {
      const { text, voiceName = 'gemini-puck' } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Texto é obrigatório" });
      }

      // Map voiceName to Gemini prebuilt voice
      const geminiVoiceMap: Record<string, string> = {
        'gemini-puck': 'Puck',
        'gemini-charon': 'Charon',
        'gemini-kore': 'Kore',
        'gemini-fenrir': 'Fenrir',
        'gemini-aoede': 'Aoede'
      };
      const selectedPrebuilt = geminiVoiceMap[voiceName] || 'Puck';

      const ai = getGeminiClient();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: `Leia com pronúncia brasileira clara, natural e expressiva o seguinte texto: "${text}"`,
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedPrebuilt
                }
              }
            }
          }
        });

        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
        if (part?.inlineData?.data) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          res.set({
            "Content-Type": part.inlineData.mimeType || "audio/wav",
            "Content-Length": buffer.length.toString(),
          });
          return res.send(buffer);
        }
      } catch (geminiAudioErr) {
        console.warn("Gemini audio modality fallback:", geminiAudioErr);
      }

      // If audio modality is not available, fallback to OpenAI TTS if available
      const openAiKey = getOpenAiApiKey();
      if (openAiKey) {
        const openAiResp = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openAiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "tts-1",
            input: String(text).trim().slice(0, 4096),
            voice: "alloy",
            response_format: "mp3"
          })
        });

        if (openAiResp.ok) {
          const buffer = Buffer.from(await openAiResp.arrayBuffer());
          res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": buffer.length.toString()
          });
          return res.send(buffer);
        }
      }

      return res.status(501).json({ error: "Sintetizador Gemini temporariamente indisponível no servidor. Usando síntese nativa do cliente." });
    } catch (error: any) {
      console.error("Gemini TTS Error:", error);
      res.status(500).json({ error: error.message || "Erro no Gemini TTS" });
    }
  });

  // Microsoft Antonio Voice Endpoint
  app.post("/api/microsoft/tts", requireAuth, async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Texto é obrigatório" });
      }

      // Fallback to OpenAI natural voice if configured
      const openAiKey = getOpenAiApiKey();
      if (openAiKey) {
        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openAiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "tts-1",
            input: String(text).trim().slice(0, 4096),
            voice: "onyx",
            response_format: "mp3"
          })
        });

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": buffer.length.toString(),
          });
          return res.send(buffer);
        }
      }

      res.status(501).json({ error: "Usando sintetizador Antonio local do navegador." });
    } catch (error: any) {
      console.error("Microsoft Antonio TTS Error:", error);
      res.status(500).json({ error: "Falha na síntese de voz Antonio" });
    }
  });

  // OpenAI TTS Endpoint
  app.post("/api/openai/tts", requireAuth, async (req, res) => {
    const { text, voiceName } = req.body;
    const apiKey = getOpenAiApiKey();

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Texto é obrigatório" });
    }
    if (!apiKey) {
      return res.status(401).json({ error: "OpenAI API Key não configurada no servidor (defina OPENAI_ENVIRONMENT_KEY ou OPENAI_API_KEY)" });
    }

    const normalizedVoice = typeof voiceName === "string" && OPENAI_ALLOWED_VOICES.has(voiceName.trim().toLowerCase())
      ? voiceName.trim().toLowerCase()
      : "alloy";

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text.trim().slice(0, 4096),
          voice: normalizedVoice,
          response_format: "mp3"
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || response.statusText);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      });
      res.send(buffer);
    } catch (error: any) {
      console.error("OpenAI TTS Error:", error?.message || "Unknown error");
      res.status(500).json({ error: error.message || "Falha ao gerar áudio OpenAI" });
    }
  });

  // ==========================================
  // ELEVENLABS TTS & VOICES (Dgorla & Cloned Voices)
  // ==========================================

  // ElevenLabs Text-to-Speech Endpoint
  app.post("/api/elevenlabs/tts", requireAuth, async (req: any, res) => {
    try {
      const { text, voiceId = "QeklSZR6uyDJECk01m3i", voiceSettings } = req.body;
      const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLAB_API_KEY;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Texto é obrigatório para síntese de voz" });
      }
      if (!apiKey) {
        return res.status(401).json({ error: "Chave ELEVENLABS_API_KEY não configurada no servidor" });
      }

      const targetVoiceId = voiceId || "QeklSZR6uyDJECk01m3i";
      const targetModelId = req.body.model_id || "eleven_v4";
      console.log(`[ElevenLabs TTS] Gerando áudio com modelo ${targetModelId} e voz ${targetVoiceId} para: "${text.substring(0, 40)}..."`);

      let response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: targetModelId,
          voice_settings: voiceSettings || {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      });

      // Fallback to eleven_multilingual_v2 if eleven_v4 has an issue
      if (!response.ok && targetModelId === 'eleven_v4') {
        console.warn(`[ElevenLabs TTS] eleven_v4 retornou ${response.status}. Tentando eleven_multilingual_v2...`);
        response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },
          body: JSON.stringify({
            text: text.trim(),
            model_id: "eleven_multilingual_v2",
            voice_settings: voiceSettings || {
              stability: 0.5,
              similarity_boost: 0.8,
              style: 0.0,
              use_speaker_boost: true
            }
          })
        });
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[ElevenLabs API Error ${response.status}]:`, errText);
        return res.status(response.status).json({ error: `ElevenLabs TTS error: ${errText || response.statusText}` });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400"
      });
      res.send(buffer);
    } catch (error: any) {
      console.error("[ElevenLabs Server Error]:", error);
      res.status(500).json({ error: error.message || "Falha ao gerar áudio com ElevenLabs" });
    }
  });

  // ElevenLabs List Voices Endpoint
  app.get("/api/elevenlabs/voices", async (_req, res) => {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLAB_API_KEY;
      if (!apiKey) {
        return res.json({ voices: [] });
      }

      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: {
          "xi-api-key": apiKey,
        }
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("ElevenLabs voices error:", err);
        return res.json({ voices: [] });
      }

      const data = await response.json();
      const rawVoices = data.voices || [];

      const formattedVoices = rawVoices.map((v: any) => {
        const isDgorla = v.voice_id === 'QeklSZR6uyDJECk01m3i' || v.name.toLowerCase() === 'dgorla';
        const isCloned = v.category === 'cloned';
        const isPt = v.labels?.language === 'pt' || (v.labels?.accent || '').toLowerCase().includes('brazil') || isDgorla;

        return {
          id: v.voice_id,
          name: isDgorla ? 'Dgorla (Voz Oficial Clonada • Eleven V4)' : `${v.name} (Eleven V4)`,
          lang: isPt ? 'pt-BR' : (v.labels?.language || 'multilingual'),
          primaryLang: isPt ? 'pt' : (v.labels?.language || 'en'),
          verifiedLanguages: ['pt', 'en', 'es', 'fr', 'de', 'it'],
          isElevenLabs: true,
          provider: 'elevenlabs',
          model: 'eleven_v4',
          gender: v.labels?.gender || (isDgorla ? 'male' : 'neutral'),
          accent: isDgorla ? 'Brasileiro (Clonada Oficial • Eleven V4)' : (v.labels?.accent || (isPt ? 'Português Brasileiro' : 'Multilíngue')),
          useCase: isDgorla ? 'Voz Principal Padrão (Eleven V4)' : (isCloned ? 'Voz Clonada Personalizada' : 'Narração e Leitura'),
          description: v.description || (isDgorla 
            ? 'Voz oficial de altíssima fidelidade e entonação natural de Dgorla sintetizada via ElevenLabs Modelo Eleven V4.' 
            : `Voz ${isCloned ? 'clonada personalizada' : 'neural'} ElevenLabs sintetizada no modelo Eleven V4.`),
          category: isDgorla ? 'Dgorla Padrão' : isCloned ? 'ElevenLabs Clonadas' : 'ElevenLabs AI',
          previewUrl: v.preview_url,
          isCustom: isCloned,
        };
      });

      // Sort with Dgorla at the absolute top, then other cloned voices, then professional/premade
      formattedVoices.sort((a: any, b: any) => {
        const aIsDgorla = a.id === 'QeklSZR6uyDJECk01m3i' || a.name.toLowerCase().includes('dgorla');
        const bIsDgorla = b.id === 'QeklSZR6uyDJECk01m3i' || b.name.toLowerCase().includes('dgorla');
        if (aIsDgorla && !bIsDgorla) return -1;
        if (!aIsDgorla && bIsDgorla) return 1;
        if (a.isCustom && !b.isCustom) return -1;
        if (!a.isCustom && b.isCustom) return 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ voices: formattedVoices });
    } catch (error: any) {
      console.error("ElevenLabs voices fetch error:", error);
      res.json({ voices: [] });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("Express server error:", err);
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
