const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(/req\.user = decodedToken;/g, '(req as any).user = decodedToken;');
code = code.replace(/req\.user\.uid/g, '(req as any).user.uid');
fs.writeFileSync('server.ts', code);
