// scripts/test-email.js
// 🧪 ทดสอบส่ง email — Manual run only

const nodemailer = require('nodemailer');

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

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD
  }
});

const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

const subject = `🧪 Test Email from RUDY [${time}]`;

const html = `
<div style="font-family:-apple-system,'Sarabun',sans-serif;max-width:520px;margin:0 auto;padding:24px;background:linear-gradient(135deg,#1a0b2e,#16213e);color:#fff;border-radius:16px">
  <h1 style="margin:0 0 8px;font-size:24px;background:linear-gradient(135deg,#68d391,#4fd1c5);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
    🧪 Test Email!
  </h1>
  <p style="font-size:16px;line-height:1.6;color:rgba(255,255,255,0.85);margin:8px 0">
    ถ้าคุณเห็น email นี้ = ระบบ RUDY Email Notification <strong style="color:#68d391">ทำงานปกติ!</strong> 🎉
  </p>
  <p style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:16px">
    เวลาทดสอบ: ${time}
  </p>
  <p style="margin-top:24px;font-size:12px;color:rgba(255,255,255,0.4)">
    — ส่งจาก GitHub Actions
  </p>
</div>
`;

async function main() {
  console.log('=== 🧪 TEST EMAIL START ===');
  console.log('Time:', time);
  console.log(`Sending to ${TEAM_EMAILS.length} recipients...`);

  let sent = 0;
  let failed = 0;

  for (const to of TEAM_EMAILS) {
    try {
      await transporter.sendMail({
        from: `"RUDY 🧪" <${GMAIL_USER}>`,
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
