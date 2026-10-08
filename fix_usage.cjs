const fs = require('fs');
let code = fs.readFileSync('services/api.ts', 'utf-8');

const usageImpl = `import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const checkUsageLimit = async (source: 'url' | 'file' | 'text'): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Para utilizar esta função, por favor faça login usando sua conta Google (botão no topo direito).');
  }

  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);
  
  let userData = userDoc.exists() ? userDoc.data() : { plan: 'free', usage: {} };
  if (!userData.usage) userData.usage = {};

  if (userData.plan === 'free') {
    const sourceUsage = userData.usage[source] || 0;
    if (sourceUsage >= 1) {
      throw new Error(\`Você atingiu o limite gratuito de 1 leitura para a fonte: \${source}. Assine o plano Pro para continuar.\`);
    }
    // Increment usage
    await setDoc(userRef, {
      usage: { ...userData.usage, [source]: sourceUsage + 1 }
    }, { merge: true });
  }
};
`;

code = code.replace(
  /export const checkUsageLimit = async \([^)]*\): Promise<void> => {[\s\S]*?};\n/,
  ""
);

code = code.replace(
  "import { fetchWithAuth } from '../lib/authHelper';",
  "import { fetchWithAuth } from '../lib/authHelper';\n" + usageImpl
);

fs.writeFileSync('services/api.ts', code);
