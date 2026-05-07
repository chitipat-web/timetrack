// scripts/test-push.js
// 🧪 TEST SCRIPT — ส่ง push ไปทุก subscription ทันทีโดยไม่เช็คเงื่อนไข
// ใช้สำหรับ verify ว่าระบบ push ทำงานจริงตอนปิดแอพ
// ⚠️ ใช้ test เท่านั้น อย่า schedule

const admin = require('firebase-admin');
const webpush = require('web-push');

// ===== Init Firebase Admin =====
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app'
});
const db = admin.database();

// ===== Init Web Push =====
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  throw new Error('VAPID_PUBLIC and VAPID_PRIVATE env vars are required');
}

webpush.setVapidDetails(
  VAPID_SUBJECT || 'mailto:chitipat.kao@gmail.com',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

// ===== Send to one subscription =====
async function sendOne(sub, payload) {
  const subscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.keys && sub.keys.p256dh,
      auth: sub.keys && sub.keys.auth
    }
  };
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60
  });
}

// ===== Main =====
async function main() {
  console.log('=== 🧪 TEST PUSH START ===');
  console.log('Time:', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }));

  // ดึงทุก subscription
  const subsSnap = await db.ref('fcm_subs').once('value');
  const allUsers = subsSnap.val() || {};

  const userIds = Object.keys(allUsers);
  console.log(`Found ${userIds.length} user(s) with subscriptions`);

  if (userIds.length === 0) {
    console.log('⚠️  ไม่มี subscription เลย — ทุกคนต้องเปิดแอพ + allow notification ก่อน');
    return;
  }

  const payload = {
    title: '🧪 Test Push from GitHub Actions',
    body: 'ถ้าเห็นข้อความนี้ = push ทำงานปกติ! เวลา ' + new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false }),
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'rudy-test-' + Date.now(),
    url: './'
  };

  let sent = 0;
  let failed = 0;
  const expiredSubs = [];

  for (const uid of userIds) {
    const devices = allUsers[uid] || {};
    const deviceIds = Object.keys(devices);
    console.log(`\nUser ${uid}: ${deviceIds.length} device(s)`);

    for (const did of deviceIds) {
      const sub = devices[did];
      if (!sub || !sub.endpoint || !sub.keys) {
        console.log(`  ⏭  ${did}: invalid sub data, skip`);
        continue;
      }

      const userName = sub.userName || '(no name)';
      const userEmail = sub.userEmail || '(no email)';
      const endpointHost = (sub.endpoint || '').split('/')[2] || '?';

      try {
        await sendOne(sub, payload);
        console.log(`  ✅ ${did} → ${userName} <${userEmail}> via ${endpointHost}`);
        sent++;
      } catch (err) {
        const status = err.statusCode || err.code || 'unknown';
        console.log(`  ❌ ${did} → ${userName}: ${status} ${err.body || err.message || ''}`);
        failed++;

        // 404/410 = expired subscription → เก็บไว้ลบ
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredSubs.push(`fcm_subs/${uid}/${did}`);
        }
      }
    }
  }

  // ลบ expired subscriptions
  if (expiredSubs.length > 0) {
    console.log(`\n🧹 Removing ${expiredSubs.length} expired subscription(s)...`);
    const updates = {};
    for (const path of expiredSubs) updates[path] = null;
    await db.ref().update(updates);
  }

  console.log('\n=== 📊 SUMMARY ===');
  console.log(`Sent OK:  ${sent}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Expired:  ${expiredSubs.length}`);
  console.log('=== END ===');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
