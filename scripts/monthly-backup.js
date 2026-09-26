// scripts/monthly-backup.js
// Monthly full backup of the RUDY Realtime Database, emailed to the admin(s)
// as a gzipped JSON attachment. Owner's choice: email only — nothing is
// written to the repo (it is public).
//
// Triggered by .github/workflows/monthly-backup.yml (monthly cron + manual).
//
// SAFETY:
//  - Read-only on Firebase (never writes).
//  - DRY_RUN=true → build the backup and log sizes, but do not send.
//  - Never logs record contents, only node names / counts / sizes.
//  - Attachment is gzip; if it would exceed Gmail's limit, the heavy
//    'photos' node is dropped from the attachment and the email says so.
//  - Exit 1 on any failure so the Actions run shows red.

const zlib = require('zlib');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const MAX_ATTACH_BYTES = 20 * 1024 * 1024; // Gmail limit is 25 MB incl. encoding overhead

function dateIDT() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function countOf(v) {
  if (v && typeof v === 'object') return Object.keys(v).length;
  return v == null ? 0 : 1;
}

// Pure: data object → { gz, dropped, summary }. Exported for testing.
function buildBackup(data, stamp) {
  const root = data || {};
  const payload = { _meta: { app: 'RUDY', createdAtIDT: stamp, source: 'firebase-rtdb' }, data: root };
  let gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  let dropped = [];
  if (gz.length > MAX_ATTACH_BYTES && root.photos) {
    const slim = Object.assign({}, root); delete slim.photos;
    payload.data = slim; payload._meta.dropped = ['photos'];
    gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
    dropped = ['photos'];
  }
  const summary = Object.keys(root).sort().map(k => ({ node: k, count: countOf(root[k]), dropped: dropped.includes(k) }));
  return { gz, dropped, summary };
}

function recipients(employees) {
  const list = Object.values(employees || {})
    .filter(e => e && e.role === 'admin' && e.email)
    .map(e => String(e.email).trim());
  const uniq = [...new Set(list)];
  return uniq.length ? uniq : (GMAIL_USER ? [GMAIL_USER] : []);
}

async function main() {
  if (!GMAIL_USER || !GMAIL_PASS || !process.env.FIREBASE_SERVICE_KEY) {
    console.error('❌ Missing required secrets: GMAIL_USER, GMAIL_APP_PASSWORD, FIREBASE_SERVICE_KEY');
    process.exit(1);
  }
  const nodemailer = require('nodemailer');
  const { init } = require('./lib/firebase');
  const admin = init();
  const stamp = dateIDT();

  let data;
  try {
    const snap = await admin.database().ref('/').once('value');
    data = snap.val() || {};
  } catch (e) {
    console.error('❌ Firebase read failed:', e.message);
    process.exit(1);
  }

  const { gz, dropped, summary } = buildBackup(data, stamp);
  const to = recipients(data.employees);
  console.log('Nodes     :', summary.map(s => s.node + '(' + s.count + ')').join(', '));
  console.log('Size      :', (gz.length / 1024).toFixed(1), 'KB gzip', dropped.length ? '(dropped: ' + dropped.join(',') + ')' : '');
  console.log('Recipients:', to.length);
  if (!to.length) { console.error('❌ No recipient (no admin email, no GMAIL_USER)'); process.exit(1); }
  if (!summary.length) { console.error('❌ Database is empty — refusing to send an empty backup'); process.exit(1); }

  const rows = summary.map(s => '<tr><td style="padding:4px 12px 4px 0">' + s.node + '</td><td style="padding:4px 0">' +
    s.count + (s.dropped ? ' (ไม่ได้แนบ — ไฟล์ใหญ่เกิน)' : '') + '</td></tr>').join('');
  const html = '<div style="font-family:sans-serif">' +
    '<h2>🗄️ RUDY สำรองข้อมูลประจำเดือน — ' + stamp + '</h2>' +
    '<p>ไฟล์แนบคือข้อมูลทั้งหมดในระบบ (JSON บีบอัด .gz) เก็บไฟล์นี้ไว้ ถ้าข้อมูลหายสามารถกู้คืนได้</p>' +
    '<table style="border-collapse:collapse;font-size:14px"><tr><th align="left">ส่วนข้อมูล</th><th align="left">จำนวน</th></tr>' + rows + '</table>' +
    '<p style="color:#888;font-size:12px">ขนาดไฟล์ ' + (gz.length / 1024).toFixed(1) + ' KB · ส่งอัตโนมัติวันที่ 1 ของทุกเดือน</p></div>';

  if (DRY_RUN) { console.log('🧪 DRY_RUN — not sending'); return; }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
  try {
    await transporter.sendMail({
      from: 'RUDY <' + GMAIL_USER + '>',
      to: to.join(','),
      subject: '🗄️ RUDY สำรองข้อมูล ' + stamp,
      html,
      attachments: [{ filename: 'rudy-backup-' + stamp + '.json.gz', content: gz, contentType: 'application/gzip' }]
    });
    console.log('✅ Backup emailed');
  } catch (e) {
    console.error('❌ Send failed:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error('❌ FATAL:', e && e.message); process.exit(1); });
}

module.exports = { buildBackup, recipients };
