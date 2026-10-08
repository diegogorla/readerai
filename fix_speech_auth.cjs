const fs = require('fs');
let code = fs.readFileSync('hooks/useSpeech.ts', 'utf-8');

if (!code.includes("import { auth } from '../lib/firebase';")) {
  code = code.replace(
    "import { Voice, TTSState } from '../types';",
    "import { Voice, TTSState } from '../types';\nimport { auth } from '../lib/firebase';"
  );
}

if (!code.includes("auth.currentUser?.getIdToken()")) {
  code = code.replace(
    "const response = await fetch('/api/openai/tts', {",
    `const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/openai/tts', {`
  );
  code = code.replace(
    "headers: { 'Content-Type': 'application/json' },",
    "headers: { \n            'Content-Type': 'application/json',\n            'Authorization': \`Bearer \${token}\`\n          },"
  );
}

fs.writeFileSync('hooks/useSpeech.ts', code);
