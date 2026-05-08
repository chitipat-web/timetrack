// scripts/notify-checkin-email.js
// ส่ง email เตือน check-in ให้ทีมทุกคน

const nodemailer = require('nodemailer');

// ===== Config =====
const TEAM_EMAILS = [
  'chitipat.kao@gmail.com',
  'lenghlx1@gmail.com',
  'chitipat.kee@gmail.com'
];

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required');
}

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

// ===== Main =====
async function main() {
  console.log('=== 📧 CHECK-IN EMAIL START ===');
  console.log('Time:', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }));
  console.log(`Sending to ${TEAM_EMAILS.length} recipients...`);

  let sent = 0;
  let failed = 0;

  for (const to of TEAM_EMAILS) {
    try {
      await transporter.sendMail({
        from: `"RUDY ⏰" <${GMAIL_USER}>`,
        to: to,
        subject: subject,
        html: html
      });
      console.log(`  ✅ ${to}`);
      sent++;
    } catch (err) {
      console.log(`  ❌ ${to}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=== 📊 SUMMARY ===');
  console.log(`Sent OK:  ${sent}`);
  console.log(`Failed:   ${failed}`);
  console.log('=== END ===');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
