// scripts/notify-checkin-email.js
// Smart logic: ส่ง email check-in reminder เฉพาะคนที่ยังไม่ check-in วันนี้

const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

// ===== Config =====
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FIREBASE_SERVICE_KEY = process.env.FIREBASE_SERVICE_KEY;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required');
}
if (!FIREBASE_SERVICE_KEY) {
  throw new Error('FIREBASE_SERVICE_KEY env var is required');
}

// ===== Init Firebase Admin =====
const serviceAccount = JSON.parse(FIREBASE_SERVICE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app'
});
const db = admin.database();

// ===== Setup transporter =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD
  }
});

// ===== Email content =====
const subject = '⏰ อย่าลืม Check-in งานวันนี้!';

const html = `
<div style="font-family:-apple-system,'Sarabun',sans-serif;max-width:520px;margin:0 auto;padding:24px;background:linear-gradient(135deg,#1a0b2e,#16213e);color:#fff;border-radius:16px">
  <h1 style="margin:0 0 8px;font-size:24px;background:linear-gradient(135deg,#b794f4,#ed64a6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
    🌅 อรุณสวัสดิ์!
  </h1>
  <p style="font-size:16px;line-height:1.6;color:rgba(255,255,255,0.85);margin:8px 0">
    ถึงเวลาเริ่มงานแล้ว ✨<br>
    อย่าลืมกด <strong style="color:#b794f4">Check-in</strong> ในแอพ RUDY นะ
  </p>
  <a href="https://chitipat-web.github.io/timetrack/"
     style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#b794f4,#ed64a6);color:#fff;text-decoration:none;border-radius:12px;font-weight:600">
    เปิดแอพ RUDY
  </a>
  <p style="margin-top:24px;font-size:12px;color:rgba(255,255,255,0.4)">
    — ส่งโดย RUDY Notifier
  </p>
</div>
`;

// ===== Helpers =====
function getTodayDateIDT() {
  // Get YYYY-MM-DD in Israel timezone (Asia/Jerusalem)
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(now); // "2026-05-11"
}

// ===== Main =====
async function main() {
  console.log('=== 📧 SMART CHECK-IN EMAIL START ===');
  console.log('Time:', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }), 'IDT');

  const today = getTodayDateIDT();
  console.log('Today (IDT):', today);

  // 1) Load all employees
  console.log('\n📥 Loading employees from Firebase...');
  const empSnap = await db.ref('employees').once('value');
  const employees = empSnap.val() || {};
  const empList = Object.entries(employees).map(([uid, emp]) => ({
    uid,
    email: emp.email,
    name: emp.name || emp.initial || uid
  }));
  console.log(`  ✓ Found ${empList.length} employee(s)`);

  // 2) Load today's records and build set of empIds who already checked in
  console.log('\n📥 Loading today\'s records...');
  const recSnap = await db.ref('records').once('value');
  const records = recSnap.val() || {};
  const checkedInUids = new Set();
  let todayRecordCount = 0;
  for (const rec of Object.values(records)) {
    if (rec && rec.date === today && rec.checkIn && rec.empId) {
      checkedInUids.add(rec.empId);
      todayRecordCount++;
    }
  }
  console.log(`  ✓ Found ${todayRecordCount} check-in record(s) today`);

  // 3) Determine who needs reminder
  console.log('\n🔍 Checking who needs reminder:');
  const needReminder = [];
  for (const emp of empList) {
    if (!emp.email) {
      console.log(`  ⚠️  ${emp.name} - no email, skipped`);
      continue;
    }
    if (checkedInUids.has(emp.uid)) {
      console.log(`  ⏭️  ${emp.name} (${emp.email}) - already checked in`);
    } else {
      console.log(`  📧 ${emp.name} (${emp.email}) - needs reminder`);
      needReminder.push(emp);
    }
  }

  // 4) Send emails
  if (needReminder.length === 0) {
    console.log('\n🎉 Everyone already checked in! No emails to send.');
  } else {
    console.log(`\n📤 Sending ${needReminder.length} email(s)...`);
  }

  let sent = 0;
  let failed = 0;
  for (const emp of needReminder) {
    try {
      await transporter.sendMail({
        from: `"RUDY ⏰" <${GMAIL_USER}>`,
        to: emp.email,
        subject: subject,
        html: html
      });
      console.log(`  ✅ ${emp.email}`);
      sent++;
    } catch (err) {
      console.log(`  ❌ ${emp.email}: ${err.message}`);
      failed++;
    }
  }

  // 5) Summary
  console.log('\n=== 📊 SUMMARY ===');
  console.log(`Total employees:  ${empList.length}`);
  console.log(`Already done:     ${checkedInUids.size}`);
  console.log(`Need reminder:    ${needReminder.length}`);
  console.log(`Sent OK:          ${sent}`);
  console.log(`Failed:           ${failed}`);
  console.log('=== END ===');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
