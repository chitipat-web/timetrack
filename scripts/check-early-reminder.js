// scripts/check-early-reminder.js
// Runs at 5:45 ICT — reminds team that work starts in 15 minutes.
// Sends to ALL subscribed users (no filtering by today's check-in).

const { init } = require('./lib/firebase');
const { sendToAll } = require('./lib/notify');

async function main() {
  console.log('=== check-early-reminder ===');

  const admin = init();
  const db = admin.database();

  // Read shared work_start (set by admin in Settings) — fall back to 06:00
  const wsSnap = await db.ref('shared/tt_work_start').once('value');
  const workStart = wsSnap.val() || '06:00';
  console.log('Work start time:', workStart);

  const totals = await sendToAll({
    title: '🌅 อีก 15 นาทีถึงเวลาเข้างาน',
    body: `เวลาเข้างาน ${workStart} — เตรียมตัวกด check-in ได้แล้ว!`,
    tag: 'early-reminder',
    url: './',
  });

  console.log('Result:', totals);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
