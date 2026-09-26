// scripts/check-no-checkout.js
// 22:00 Israel time — finds employees who checked in today but didn't check out.
// Was on Bangkok time (15:00 UTC = 18:00 IDT, while people still work OT).
// The workflow now runs at both candidate UTC times (IDT/IST); this script
// sends only between 22:00 and 24:00 Israel time, once per Israel day.
// FORCE=true (manual run) skips the window check.

const { init } = require('./lib/firebase');
const { sendToUsers } = require('./lib/notify');
const { ilNow, inWindow, claimOncePerDay } = require('./lib/iltime');

async function main() {
  console.log('=== check-no-checkout ===');
  const now = ilNow();
  const today = now.date;
  const force = String(process.env.FORCE || '').toLowerCase() === 'true';
  console.log('Israel now:', today, String(now.hour).padStart(2, '0') + ':' + String(now.minute).padStart(2, '0'), force ? '(forced)' : '');

  const admin = init();
  const db = admin.database();

  if (!force && !inWindow(now, 22 * 60, 24 * 60)) {
    console.log('Outside the 22:00-24:00 Israel window — skipping.');
    process.exit(0);
  }
  if (!force && !(await claimOncePerDay(db, 'no-checkout', today))) {
    console.log('Already sent today — skipping.');
    process.exit(0);
  }

  const [recSnap, empSnap] = await Promise.all([
    db.ref('records').once('value'),
    db.ref('employees').once('value'),
  ]);

  const records = recSnap.val() ? Object.values(recSnap.val()) : [];
  const employees = empSnap.val() || {};

  // Find records for today where checkIn exists but checkOut is null/empty
  const noCheckout = records.filter(r =>
    r && r.date === today && r.checkIn && !r.checkOut
  );

  console.log(`Found ${noCheckout.length} employee(s) without checkout`);

  if (noCheckout.length === 0) {
    console.log('Nothing to notify.');
    process.exit(0);
  }

  const uids = [...new Set(noCheckout.map(r => r.empId).filter(Boolean))];
  console.log('Target UIDs:', uids);

  const totals = await sendToUsers(uids, (uid) => {
    const emp = employees[uid];
    const name = emp?.name?.split(' ')[0] || 'เพื่อน';
    const rec = noCheckout.find(r => r.empId === uid);
    const checkInTime = rec?.checkIn || '';
    return {
      title: 'เฮ้ยยังไม่ check-out นะ 🤝',
      body: `${name} เข้างาน ${checkInTime} แล้ว แต่ยังไม่ออกเลย รีบกดก่อนนอน!`,
      tag: 'no-checkout-' + today,
      url: './',
    };
  });

  console.log('Result:', totals);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
