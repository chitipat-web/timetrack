// scripts/check-early-reminder.js
// Reminds the team shortly before work starts (Israel time).
// Sends to ALL subscribed users (no filtering by today's check-in).
// Was scheduled on Bangkok time (22:45 UTC = 01:45 IDT!). Now the workflow
// runs at both candidate UTC times (IDT/IST) and this script only sends in
// the 45 min before work start, once per Israel day. FORCE=true (manual run)
// skips the window check.

const { init } = require('./lib/firebase');
const { sendToAll } = require('./lib/notify');
const { ilNow, hmToMin, inWindow, claimOncePerDay } = require('./lib/iltime');

async function main() {
  console.log('=== check-early-reminder ===');

  const admin = init();
  const db = admin.database();

  // Read shared work_start (set by admin in Settings) — fall back to 06:00
  const wsSnap = await db.ref('shared/tt_work_start').once('value');
  const workStart = wsSnap.val() || '06:00';
  console.log('Work start time:', workStart);

  const now = ilNow();
  const force = String(process.env.FORCE || '').toLowerCase() === 'true';
  const ws = hmToMin(workStart);
  console.log('Israel now:', now.date, String(now.hour).padStart(2, '0') + ':' + String(now.minute).padStart(2, '0'), force ? '(forced)' : '');
  if (!force && !inWindow(now, ws - 45, ws)) {
    console.log('Outside the pre-work window — skipping.');
    process.exit(0);
  }
  if (!force && !(await claimOncePerDay(db, 'early', now.date))) {
    console.log('Already sent today — skipping.');
    process.exit(0);
  }

  const totals = await sendToAll({
    title: '🌅 ใกล้ถึงเวลาเข้างานแล้ว',
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
