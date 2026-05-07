// scripts/lib/firebase.js
// Initialize Firebase Admin SDK using Service Account from env

const admin = require('firebase-admin');

function init() {
  if (admin.apps.length) return admin;

  const raw = process.env.FIREBASE_SERVICE_KEY;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_KEY env var is missing');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_KEY is not valid JSON: ' + e.message);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app',
  });

  return admin;
}

module.exports = { init, admin };
