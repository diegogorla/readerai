const fs = require('fs');
let code = fs.readFileSync('components/SubscriptionModal.tsx', 'utf-8');

code = code.replace(
  "import { fetchWithAuth } from '../lib/authHelper';",
  "import { fetchWithAuth } from '../lib/authHelper';\nimport { db, auth } from '../lib/firebase';\nimport { doc, setDoc } from 'firebase/firestore';"
);

const checkoutCode = `
      if (!auth.currentUser) throw new Error('Não autenticado');
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userRef, { 
        plan: 'pro', 
        planType, 
        currency, 
        upgradedAt: new Date().toISOString() 
      }, { merge: true });
`;

code = code.replace(
  /const response = await fetchWithAuth\('\/api\/checkout', {[\s\S]*?}\);[\s\S]*?if \(!response\.ok\) {[\s\S]*?}/,
  checkoutCode
);

fs.writeFileSync('components/SubscriptionModal.tsx', code);
