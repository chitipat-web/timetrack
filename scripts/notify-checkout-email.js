// scripts/notify-checkout-email.js
// Smart check-out reminder with AI-generated content
// Triggered by cron-job.org at 22:00 IDT via workflow_dispatch

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const ai = require('./lib/ai-content');

const FIREBASE_DB_URL = 'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app';
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const FIREBASE_KEY = process.env.FIREBASE_SERVICE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GMAIL_USER || !GMAIL_PASS || !FIREBASE_KEY) {
  console.error('❌ Missing required secrets');
  process.exit(1);
}

function getTodayDateIDT() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

function getNowInIDT() {
  const idtString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  return new Date(idtString);
}

function buildEmailHTML({ employee, content }) {
  const bodyHTML = content.body.replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Sarabun', sans-serif; margin: 0; padding: 0; background: #0a0612; }
  .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16213e 0%, #1a0b2e 100%); padding: 40px 30px; }
  .header { text-align: center; margin-bottom: 30px; }
  .logo { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #ed64a6 0%, #b794f4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .greeting { color: #e2e8f0; font-size: 18px; margin-bottom: 20px; font-weight: 600; }
  .content { color: #cbd5e0; font-size: 16px; line-height: 1.8; margin-bottom: 30px; padding: 20px; background: rgba(237, 100, 166, 0.08); border-radius: 12px; border-left: 4px solid #ed64a6; }
  .cta { text-align: center; margin: 30px 0; }
  .btn { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #ed64a6 0%, #b794f4 100%); color: #fff !important; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; }
  .footer { text-align: center; color: #718096; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(237, 100, 166, 0.2); }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">RUDY</div>
    </div>
    <div class="greeting">สวัสดี ${employee.name} 🌙</div>
    <div class="content">${bodyHTML}</div>
    <div class="cta">
      <a href="https://chitipat-web.github.io/timetrack/" class="btn">เปิด RUDY 🌙</a>
    </div>
    <div class="footer">
      RUDY — Smart HR & Time-tracking<br>
      <small style="opacity: 0.5;">AI-generated · ${new Date().toISOString().split('T')[0]}</small>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  console.log('=== 📧 CHECK-OUT EMAIL (Smart + AI) ===');
  console.log(`Time (IDT): ${getNowInIDT().toLocaleString('th-TH')}`);

  const serviceAccount = JSON.parse(FIREBASE_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: FIREBASE_DB_URL
  });

  const db = admin.database();
  const today = getTodayDateIDT();
  console.log(`Today (IDT): ${today}`);

  const employeesSnap = await db.ref('employees').once('value');
  const employeesObj = employeesSnap.val() || {};
  const employees = Object.entries(employeesObj).map(([uid, data]) => ({
    uid,
    name: data.name || 'Unknown',
    email: data.email || null,
    role: data.role || 'user'
  }));

  const recordsSnap = await db.ref('records').once('value');
  const recordsObj = recordsSnap.val() || {};
  const records = Object.values(recordsObj);

  const todayRecords = {};
  for (const r of records) {
    if (r.date === today) {
      todayRecords[r.empId] = r;
    }
  }

  console.log(`Found ${employees.length} employee(s)\n`);

  const dayContext = ai.getDayContext(getNowInIDT());

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  let sentOK = 0;
  let failed = 0;
  let aiUsed = 0;
  let fallbackUsed = 0;

  for (const emp of employees) {
    const todayRec = todayRecords[emp.uid];

    if (!todayRec || !todayRec.checkIn) {
      console.log(`⏭️  ${emp.name} - ไม่ได้ check-in วันนี้`);
      continue;
    }

    if (todayRec.checkOut) {
      console.log(`✅ ${emp.name} - check-out แล้วเรียบร้อย`);
      continue;
    }

    if (!emp.email) {
      console.log(`⚠️  ${emp.name} - no email, skip`);
      continue;
    }

    console.log(`📧 ${emp.name} (${emp.email}) - ยังไม่ check-out`);

    const pattern = ai.analyzeEmployeePattern(emp.uid, records, today);
    console.log(`   Pattern: ${pattern.label} - ${pattern.detail}`);

    let content;
    if (GEMINI_KEY) {
      try {
        content = await ai.generateCheckoutContent({
          employee: emp,
          pattern,
          dayContext,
          checkInTime: todayRec.checkIn,
          apiKey: GEMINI_KEY
        });
        console.log(`   🤖 AI [${content.meta.tone}] ${content.subject}`);
        aiUsed++;
      } catch (err) {
        console.warn(`   ⚠️ AI failed: ${err.message}`);
        content = ai.getFallbackCheckoutContent(emp);
        fallbackUsed++;
      }
    } else {
      console.log('   ℹ️ No GEMINI_API_KEY, using fallback');
      content = ai.getFallbackCheckoutContent(emp);
      fallbackUsed++;
    }

    try {
      await transporter.sendMail({
        from: `RUDY <${GMAIL_USER}>`,
        to: emp.email,
        subject: content.subject,
        html: buildEmailHTML({ employee: emp, content })
      });
      console.log(`   ✅ Sent`);
      sentOK++;
    } catch (err) {
      console.error(`   ❌ Send failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Sent OK: ${sentOK}`);
  console.log(`Failed: ${failed}`);
  console.log(`AI used: ${aiUsed}`);
  console.log(`Fallback used: ${fallbackUsed}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
