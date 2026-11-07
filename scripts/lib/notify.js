// scripts/lib/notify.js
// Send web-push to all devices of given user IDs.
// Cleans up dead subscriptions (HTTP 404/410) automatically.

const webpush = require('web-push');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { init } = require('./firebase');

// Configure VAPID once
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:chitipat.kao@gmail.com';

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  throw new Error('VAPID_PUBLIC and VAPID_PRIVATE env vars are required');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Per-device socket timeout. One device that never answered held the
// early-reminder step for 2 hours on every run (the OS TCP keep-alive limit).
// web-push applies it per socket phase, so a dead device now costs ~30 s at most.
const SEND_TIMEOUT_MS = 15000;
// A device that hasn't opened the app for this long is an old install: drop it.
// The app subscribes again by itself the next time it is opened.
const STALE_DEVICE_DAYS = 60;

// Self-check printed once per run. It answers yes/no only — it never prints a
// key or the subject. Apple answers 403 BadJwtToken to every push when the
// signing key doesn't match the key the app subscribes with, or the subject
// isn't a valid mailto:/https: URL (every run since Oct 2026: sent 0).
function b64url(s) {
  s = String(s || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function vapidSelfCheck() {
  const parts = [];
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
    const m = html.match(/VAPID_PUBLIC_KEY\s*=\s*'([^']+)'/);
    parts.push('public key = app key: ' + (m ? (m[1] === String(VAPID_PUBLIC).trim() ? 'YES' : 'NO') : 'unknown'));
  } catch (_) { parts.push('public key = app key: unknown'); }
  try {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(b64url(VAPID_PRIVATE));
    parts.push('private key pairs with public key: ' + (ecdh.getPublicKey().equals(b64url(VAPID_PUBLIC)) ? 'YES' : 'NO'));
  } catch (_) { parts.push('private key pairs with public key: NO (unreadable)'); }
  const sub = String(VAPID_SUBJECT);
  const subOk = /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s\/]+\.[^\s\/]+\S*)$/.test(sub) && !/localhost|\.local(\/|$)/i.test(sub);
  parts.push('subject: ' + (subOk ? 'OK' : 'BAD (use mailto:name@domain or https://domain, no spaces)'));
  console.log('[VAPID] ' + parts.join(' · ') + (process.env.VAPID_SUBJECT ? '' : ' (subject from default)'));
}
try { vapidSelfCheck(); } catch (_) {}

/**
 * Send a push notification to all devices of a single user.
 * @param {string} uid           Firebase Auth UID (key under fcm_subs/)
 * @param {object} payload       { title, body, tag?, url?, icon? }
 * @returns {Promise<{sent:number, failed:number, removed:number}>}
 */
async function sendToUser(uid, payload) {
  const admin = init();
  const db = admin.database();
  const snap = await db.ref('fcm_subs/' + uid).once('value');
  const devices = snap.val() || {};
  const deviceIds = Object.keys(devices);

  if (deviceIds.length === 0) {
    console.log(`  [${uid}] no devices`);
    return { sent: 0, failed: 0, removed: 0 };
  }

  const body = JSON.stringify(payload);
  let sent = 0, failed = 0, removed = 0, badJwt = 0;

  await Promise.all(deviceIds.map(async (deviceId) => {
    const sub = devices[deviceId];
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      console.log(`  [${uid}/${deviceId}] malformed sub, removing`);
      await db.ref(`fcm_subs/${uid}/${deviceId}`).remove().catch(() => {});
      removed++;
      return;
    }

    // Old install (the app wasn't opened on it for STALE_DEVICE_DAYS) — remove it.
    const seen = Number(sub.lastSeen || sub.createdAt || 0);
    if (seen && Date.now() - seen > STALE_DEVICE_DAYS * 864e5) {
      await db.ref(`fcm_subs/${uid}/${deviceId}`).remove().catch(() => {});
      removed++;
      console.log(`  🧹 [${uid}/${deviceId}] not opened for ${Math.round((Date.now() - seen) / 864e5)} days — removed`);
      return;
    }

    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    };

    try {
      await webpush.sendNotification(subscription, body, { TTL: 3600, timeout: SEND_TIMEOUT_MS });
      sent++;
      console.log(`  ✅ [${uid}/${deviceId}] sent`);
    } catch (err) {
      failed++;
      const code = err.statusCode;
      if (code === 403 && /BadJwtToken/.test(String(err.body || ''))) badJwt++;
      console.log(`  ❌ [${uid}/${deviceId}] HTTP ${code}: ${err.body || err.message}`);
      // 404 = endpoint not found, 410 = gone — clean up
      if (code === 404 || code === 410) {
        await db.ref(`fcm_subs/${uid}/${deviceId}`).remove().catch(() => {});
        removed++;
        console.log(`     → removed dead sub`);
      }
    }
  }));

  return { sent, failed, removed, badJwt };
}

/**
 * Send to many users.
 * @param {string[]} uids
 * @param {object|Function} payloadOrBuilder  Either a fixed payload, or `(uid) => payload`
 */
async function sendToUsers(uids, payloadOrBuilder) {
  const totals = { users: uids.length, sent: 0, failed: 0, removed: 0, badJwt: 0 };
  for (const uid of uids) {
    const payload = typeof payloadOrBuilder === 'function'
      ? payloadOrBuilder(uid)
      : payloadOrBuilder;
    if (!payload) continue;
    const r = await sendToUser(uid, payload);
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.removed += r.removed;
    totals.badJwt += r.badJwt || 0;
  }
  if (totals.badJwt && !totals.sent) {
    console.log('⚠️ Apple rejected the signature on every device (BadJwtToken) — check the [VAPID] line above: the VAPID secrets must be the key pair whose public key is in index.html.');
  }
  return totals;
}

/**
 * Send the same payload to ALL subscribed users.
 */
async function sendToAll(payload) {
  const admin = init();
  const db = admin.database();
  const snap = await db.ref('fcm_subs').once('value');
  const allSubs = snap.val() || {};
  const uids = Object.keys(allSubs);
  return sendToUsers(uids, payload);
}

module.exports = { sendToUser, sendToUsers, sendToAll };
