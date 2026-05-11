// scripts/notify-checkout-email.js
// Smart logic: ส่ง email check-out reminder เฉพาะคนที่ check-in แล้ว แต่ยังไม่ check-out

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
const subject = '🌙 อย่าลืม Check-out ก่อนนอน!';

const html = `
<div style="font-family:-apple-system,'Sarabun',sans-serif;max-width:520px;margin:0 auto;padding:24px;background:linear-gradient(135deg,#1a0b2e,#16213e);color:#fff;border-radius:16px">
  <h1 style="margin:0 0 8px;font-size:24px;background:linear-gradient(135deg,#b794f4,#ed64a6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
    🌙 ราตรีสวัสดิ์!
  </h1>
  <p style="font-size:16px;line-height:1.6;color:rgba(255,255,255,0.85);margin:8px 0">
    ก่อนหลับ อย่าลืมกด <strong style="color:#b794f4">Check-out</strong> ในแอพ RUDY ก่อนนะ<br>
    ระบบจะได้บันทึกเวลาทำงานครบถ้วน 📊
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
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(now);
}

// ===== Main =====
async function main() {
  console.log('=== 📧 SMART CHECK-OUT EMAIL START ===');
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

  // 2) Load today's records — find who checked-in but NOT yet checked-out
  console.log('\n📥 Loading today\'s records...');
  const recSnap = await db.ref('records').once('value');
  const records = recSnap.val() || {};

  // Map: empId -> { checkedIn: bool, checkedOut: bool }
  const status = {};
  for (const rec of Object.values(records)) {
    if (!rec || rec.date !== today || !rec.empId) continue;
    if (!status[rec.empId]) status[rec.empId] = { checkedIn: false, checkedOut: false };
    if (rec.checkIn) status[rec.empId].checkedIn = true;
    if (rec.checkOut) status[rec.empId].checkedOut = true;
  }
  const checkedInCount = Object.values(status).filter(s => s.checkedIn).length;
  const checkedOutCount = Object.values(status).filter(s => s.checkedOut).length;
  console.log(`  ✓ Checked-in today: ${checkedInCount}, Checked-out: ${checkedOutCount}`);

  // 3) Determine who needs reminder
  // Send to: people who checked-in but didn't check-out yet
  // Skip: already checked-out OR never checked-in today
  console.log('\n🔍 Checking who needs reminder:');
  const needReminder = [];
  for (const emp of empList) {
    if (!emp.email) {
      console.log(`  ⚠️  ${emp.name} - no email, skipped`);
      continue;
    }
    const s = status[emp.uid];
    if (!s || !s.checkedIn) {
      console.log(`  ⏭️  ${emp.name} (${emp.email}) - did not check-in today, skipped`);
      continue;
    }
    if (s.checkedOut) {
      console.log(`  ⏭️  ${emp.name} (${emp.email}) - already checked-out`);
      continue;
    }
    console.log(`  📧 ${emp.name} (${emp.email}) - needs reminder`);
    needReminder.push(emp);
  }

  // 4) Send emails
  if (needReminder.length === 0) {
    console.log('\n🎉 Everyone already checked-out or off-duty! No emails to send.');
  } else {
    console.log(`\n📤 Sending ${needReminder.length} email(s)...`);
  }

  let sent = 0;
  let failed = 0;
  for (const emp of needReminder) {
    try {
      await transporter.sendMail({
        from: `"RUDY 🌙" <${GMAIL_USER}>`,
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
  console.log(`Total employees:    ${empList.length}`);
  console.log(`Checked-in today:   ${checkedInCount}`);
  console.log(`Already checked-out:${checkedOutCount}`);
  console.log(`Need reminder:      ${needReminder.length}`);
  console.log(`Sent OK:            ${sent}`);
  console.log(`Failed:             ${failed}`);
  console.log('=== END ===');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
