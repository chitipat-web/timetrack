// netlify/functions/set-password.js
// Free serverless backend for RUDY admin password reset (no Blaze plan).
//
// The Firebase client SDK can't set another user's password — only the
// Admin SDK (server-side) can. This Netlify Function is that server. It
// runs on Netlify's free tier (no credit card), and — critically —
// verifies the caller is an admin SERVER-SIDE from their Firebase ID
// token + DB role, never trusting the client.
//
// Env var required (set in Netlify dashboard → Site settings →
// Environment variables): FIREBASE_SERVICE_KEY = the full service-account
// JSON (same value as the GitHub secret).

const admin = require('firebase-admin');

const DB_URL =
  'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app';

// Which origins may call this function (the PWA on GitHub Pages).
const ALLOWED_ORIGINS = [
  'https://chitipat-web.github.io',
  'capacitor://localhost', // the future iOS app
];

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_KEY env var is missing');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw)),
    databaseURL: DB_URL,
  });
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

exports.handler = async (event) => {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const headers = corsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    initAdmin();

    const body = JSON.parse(event.body || '{}');
    const idToken = body.idToken || '';
    const email = (body.email || '').trim();
    const password = body.password || '';

    if (!idToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'ต้องเข้าสู่ระบบก่อน' }) };
    }

    // 1. Verify the caller's Firebase ID token.
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'โทเค็นไม่ถูกต้อง' }) };
    }

    // 2. Caller must be an admin — checked against the DB, not the client.
    const roleSnap = await admin.database().ref(`employees/${decoded.uid}/role`).get();
    if (roleSnap.val() !== 'admin') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'เฉพาะ Admin เท่านั้น' }) };
    }

    // 3. Validate inputs.
    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'กรุณาระบุอีเมล' }) };
    }
    if (password.length < 6) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }) };
    }

    // 4. Find the target + update the password.
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (e) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'ไม่พบบัญชีอีเมลนี้ในระบบ' }) };
    }

    await admin.auth().updateUser(user.uid, { password });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email }) };
  } catch (err) {
    // Log the real error server-side (Netlify function logs); return a generic
    // message to the caller so internal details aren't disclosed (v241).
    console.error('[set-password] error:', err && err.message ? err.message : err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'เกิดข้อผิดพลาดภายในระบบ' }),
    };
  }
};
