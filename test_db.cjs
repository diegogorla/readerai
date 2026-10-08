const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'gen-lang-client-0154642798' });
const db1 = getFirestore();
const db2 = getFirestore(undefined, "ai-studio-readerai-7103f7fb-7765-41b7-b9f1-cf7187ac21ec");

async function test() {
  try {
    await db1.collection('users').limit(1).get();
    console.log("db1 (default) ok");
  } catch (e) {
    console.error("db1 (default) failed", e.message);
  }
  try {
    await db2.collection('users').limit(1).get();
    console.log("db2 (custom) ok");
  } catch (e) {
    console.error("db2 (custom) failed", e.message);
  }
}
test();
