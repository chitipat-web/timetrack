// scripts/check-no-checkout.js
// Runs at 22:00 ICT — finds employees who checked in today but didn't check out.

const { init } = require('./lib/firebase');
const { sendToUsers } = require('./lib/notify');

// Get today's date in Bangkok (UTC+7) as YYYY-MM-DD
function todayBangkok() {
  const now = new Date();
  // Convert UTC to Bangkok (ICT = UTC+7)
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = bkk.getUTCFullYear();
  const m = String(bkk.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bkk.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  console.log('=== check-no-checkout ===');
  const today = todayBangkok();
  console.log('Today (Bangkok):', today);

  const admin = init();
  const db = admin.database();

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
