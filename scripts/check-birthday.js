// scripts/check-birthday.js
// Runs at 8:00 ICT — finds employees whose birthday is today
// and notifies EVERYONE (including the birthday person themselves).

const { init } = require('./lib/firebase');
const { sendToAll } = require('./lib/notify');

function todayMD_Bangkok() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const m = String(bkk.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bkk.getUTCDate()).padStart(2, '0');
  return `${m}-${d}`;
}

async function main() {
  console.log('=== check-birthday ===');
  const todayMD = todayMD_Bangkok();
  console.log('Today (MM-DD):', todayMD);

  const admin = init();
  const db = admin.database();

  const empSnap = await db.ref('employees').once('value');
  const employees = empSnap.val() || {};

  // Find people with birthday today
  const birthdayPeople = Object.values(employees).filter(e =>
    e && e.birthday === todayMD
  );

  console.log(`Found ${birthdayPeople.length} birthday person(s) today`);

  if (birthdayPeople.length === 0) {
    console.log('No birthdays today.');
    process.exit(0);
  }

  const names = birthdayPeople.map(e => e.name).filter(Boolean);
  console.log('Birthday names:', names);

  // Send single notification to all subscribers
  let title, body;
  if (names.length === 1) {
    title = '🎂 วันเกิด ' + names[0] + ' วันนี้!';
    body = 'ส่งคำอวยพรให้เพื่อนหน่อย ✨';
  } else {
    title = '🎂 วันนี้วันเกิด ' + names.length + ' คน!';
    body = names.join(', ') + ' — อย่าลืมอวยพรนะ ✨';
  }

  const totals = await sendToAll({
    title,
    body,
    tag: 'birthday-' + todayMD,
    url: './',
  });

  console.log('Result:', totals);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
