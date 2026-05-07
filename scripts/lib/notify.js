// scripts/lib/notify.js
// Send web-push to all devices of given user IDs.
// Cleans up dead subscriptions (HTTP 404/410) automatically.

const webpush = require('web-push');
const { init } = require('./firebase');

// Configure VAPID once
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:chitipat.kao@gmail.com';

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  throw new Error('VAPID_PUBLIC and VAPID_PRIVATE env vars are required');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

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
  let sent = 0, failed = 0, removed = 0;

  await Promise.all(deviceIds.map(async (deviceId) => {
    const sub = devices[deviceId];
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      console.log(`  [${uid}/${deviceId}] malformed sub, removing`);
      await db.ref(`fcm_subs/${uid}/${deviceId}`).remove().catch(() => {});
      removed++;
      return;
    }

    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    };

    try {
      await webpush.sendNotification(subscription, body, { TTL: 3600 });
      sent++;
      console.log(`  ✅ [${uid}/${deviceId}] sent`);
    } catch (err) {
      failed++;
      const code = err.statusCode;
      console.log(`  ❌ [${uid}/${deviceId}] HTTP ${code}: ${err.body || err.message}`);
      // 404 = endpoint not found, 410 = gone — clean up
      if (code === 404 || code === 410) {
        await db.ref(`fcm_subs/${uid}/${deviceId}`).remove().catch(() => {});
        removed++;
        console.log(`     → removed dead sub`);
      }
    }
  }));

  return { sent, failed, removed };
}

/**
 * Send to many users.
 * @param {string[]} uids
 * @param {object|Function} payloadOrBuilder  Either a fixed payload, or `(uid) => payload`
 */
async function sendToUsers(uids, payloadOrBuilder) {
  const totals = { users: uids.length, sent: 0, failed: 0, removed: 0 };
  for (const uid of uids) {
    const payload = typeof payloadOrBuilder === 'function'
      ? payloadOrBuilder(uid)
      : payloadOrBuilder;
    if (!payload) continue;
    const r = await sendToUser(uid, payload);
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.removed += r.removed;
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
