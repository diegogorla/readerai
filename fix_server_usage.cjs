const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const usageEndpoint = `
  app.post("/api/usage/check", requireAuth, async (req, res) => {
    try {
      const { source } = req.body; // 'url', 'file', or 'text'
      if (!source) return res.status(400).json({ error: 'Source is required' });

      const userRef = db.collection('users').doc(req.user.uid);
      const userDoc = await userRef.get();
      
      let userData = userDoc.data() || { plan: 'free', usage: {} };
      if (!userData.usage) userData.usage = {};
      
      if (userData.plan === 'free') {
        const sourceUsage = userData.usage[source] || 0;
        if (sourceUsage >= 1) {
          return res.status(403).json({ 
            error: 'Limit reached', 
            message: \`Você atingiu o limite gratuito de 1 leitura para a fonte: \${source}. Assine o plano Pro para continuar.\` 
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

  app.post("/api/checkout", requireAuth, async (req, res) => {
    // Mock checkout endpoint that upgrades the user
    try {
      const { planType, currency } = req.body;
      const userRef = db.collection('users').doc(req.user.uid);
      await userRef.set({ plan: 'pro', planType, currency, upgradedAt: new Date().toISOString() }, { merge: true });
      res.json({ success: true, message: 'Plano atualizado com sucesso via mock checkout.' });
    } catch (error) {
      res.status(500).json({ error: 'Checkout failed' });
    }
  });
`;

if (!code.includes("/api/usage/check")) {
  code = code.replace(
    'app.use(express.json({ limit: "50mb" }));',
    'app.use(express.json({ limit: "50mb" }));\n' + usageEndpoint
  );
  fs.writeFileSync('server.ts', code);
}
