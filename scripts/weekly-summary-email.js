// scripts/weekly-summary-email.js
// Weekly summary email (Mon-Fri) sent to each team member individually
// Triggered by cron-job.org at 17:00 IDT every Friday via workflow_dispatch
//
// SAFETY:
//  - try/catch around every Firebase op, email send, and per-employee loop
//  - DRY_RUN=true → log only, no send (test mode)
//  - Idempotency guard via Firebase flag (won't double-send for same week)
//  - Graceful fallback if records empty / employee has no data
//  - Hard cap on iterations to prevent runaway loops
//  - Exit codes: 0 = ok, 1 = any failure (for GitHub Actions retry signal)

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// ============================================
// CONFIG
// ============================================
const FIREBASE_DB_URL = 'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app';
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const FIREBASE_KEY = process.env.FIREBASE_SERVICE_KEY;
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const FORCE = String(process.env.FORCE || '').toLowerCase() === 'true'; // override idempotency
const WORK_START_DEFAULT = '08:00'; // ใช้ตรวจ isLate fallback ถ้า record ไม่มี
const OT_THRESHOLD_HM = '16:30'; // หลัง 16:30 IDT = OT (จาก memory)

// Hard caps (safety)
const MAX_EMPLOYEES = 50;
const MAX_RECORDS_PER_EMPLOYEE = 100;

if (!GMAIL_USER || !GMAIL_PASS || !FIREBASE_KEY) {
  console.error('❌ Missing required secrets: GMAIL_USER, GMAIL_APP_PASSWORD, FIREBASE_SERVICE_KEY');
  process.exit(1);
}

// ============================================
// DATE HELPERS (IDT = Asia/Jerusalem)
// ============================================
function getTodayDateIDT() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return fmt.format(new Date());
}

function getNowInIDT() {
  const idt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  return new Date(idt);
}

// Returns ISO week-key like "2026-W20" (ใช้เป็น idempotency key)
function getWeekKeyIDT() {
  const now = getNowInIDT();
  // หาวันจันทร์ของสัปดาห์นี้
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  // ISO week number
  const target = new Date(monday);
  target.setDate(target.getDate() + 3); // วัน Thursday ของสัปดาห์นี้
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7
  );
  return target.getFullYear() + '-W' + String(week).padStart(2, '0');
}

// คืน array ของ YYYY-MM-DD สำหรับ จ.-ศ. ของสัปดาห์ปัจจุบัน (IDT)
function getWeekRangeIDT() {
  const now = getNowInIDT();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    // format เป็น YYYY-MM-DD ตาม IDT
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    dates.push(fmt.format(d));
  }
  return { monday, friday: dates[4], dates };
}

function formatDateTH(yyyymmdd) {
  try {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return d + ' ' + (months[m-1] || '?');
  } catch(_) { return yyyymmdd; }
}

// ============================================
// SUMMARY COMPUTATION (per employee, defensive)
// ============================================
function computeWeeklySummary(emp, records, weekDates) {
  const stats = {
    daysOnTime: 0,
    daysLate: 0,
    daysMissed: 0,
    daysMissedCheckout: 0,
    totalHours: 0,
    totalOTMin: 0,
    daily: [] // {date, status, inTime, outTime, hours, otMin, note}
  };

  if (!emp || !emp.uid || !Array.isArray(records) || !Array.isArray(weekDates)) {
    return stats;
  }

  // กรอง records ของ user คนนี้ใน range จันทร์-ศุกร์
  const myRecs = records.filter(r =>
    r && r.empId === emp.uid && weekDates.indexOf(r.date) !== -1
  ).slice(0, MAX_RECORDS_PER_EMPLOYEE);

  // index by date (last record ของวันชนะ ถ้ามีหลาย entry)
  const byDate = {};
  for (const r of myRecs) {
    byDate[r.date] = r;
  }

  for (const d of weekDates) {
    const r = byDate[d];
    if (!r || !r.checkIn) {
      stats.daysMissed++;
      stats.daily.push({ date: d, status: 'missed', inTime: '-', outTime: '-', hours: 0, otMin: 0, note: '' });
      continue;
    }

    // ตรงเวลา / สาย
    if (r.isLate === true || r.isLate === 1) stats.daysLate++;
    else stats.daysOnTime++;

    // ชั่วโมงทำงาน + OT
    let hours = 0;
    if (r.checkInTs && r.checkOutTs) {
      hours = (r.checkOutTs - r.checkInTs) / 3600000;
      if (hours < 0 || hours > 24) hours = 0; // sanity check
    }
    let otMin = 0;
    if (typeof r.otMin === 'number' && r.otMin >= 0 && r.otMin <= 720) {
      otMin = r.otMin;
    }

    stats.totalHours += hours;
    stats.totalOTMin += otMin;

    const status = !r.checkOut ? 'no-checkout' : (r.isLate ? 'late' : 'ontime');
    if (status === 'no-checkout') stats.daysMissedCheckout++;

    stats.daily.push({
      date: d,
      status,
      inTime: r.checkIn || '-',
      outTime: r.checkOut || '-',
      hours: Math.round(hours * 10) / 10,
      otMin,
      note: (r.note || '').slice(0, 80)
    });
  }

  stats.totalHours = Math.round(stats.totalHours * 10) / 10;
  return stats;
}

// ============================================
// EMAIL TEMPLATE (per-employee, personalized)
// ============================================
function buildEmailHTML({ employee, stats, weekDates, weekKey }) {
  const dayNames = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];
  const statusEmoji = { ontime: '✅', late: '⏰', missed: '❌', 'no-checkout': '⚠️' };
  const statusLabel = { ontime: 'ตรงเวลา', late: 'สาย', missed: 'ไม่มา', 'no-checkout': 'ลืม checkout' };
  const statusColor = { ontime: '#48bb78', late: '#ed8936', missed: '#a0aec0', 'no-checkout': '#ecc94b' };

  // header message (ปรับตามผลงาน)
  let headerEmoji = '📊';
  let headerMsg = 'สรุปสัปดาห์ของคุณ';
  if (stats.daysLate === 0 && stats.daysMissed === 0 && stats.daysOnTime >= 5) {
    headerEmoji = '🎉';
    headerMsg = 'สัปดาห์เพอร์เฟค!';
  } else if (stats.daysLate === 0 && stats.daysMissed === 0) {
    headerEmoji = '🔥';
    headerMsg = 'ตรงเวลาทุกวัน เก่งมาก!';
  } else if (stats.daysLate >= 3) {
    headerEmoji = '💪';
    headerMsg = 'สัปดาห์หน้าสู้ใหม่!';
  }

  // daily rows
  const dailyRows = stats.daily.map((d, i) => {
    const dayName = dayNames[i] || '?';
    const dateDisplay = formatDateTH(d.date);
    const color = statusColor[d.status] || '#a0aec0';
    const label = statusLabel[d.status] || '-';
    const emoji = statusEmoji[d.status] || '·';
    const hoursDisplay = d.hours > 0 ? d.hours + ' ชม.' : '-';
    const otDisplay = d.otMin > 0 ? '+' + d.otMin + ' นาที' : '';

    return '<tr>' +
      '<td style="padding:8px 6px;color:#cbd5e0;font-weight:600;width:40px">' + dayName + '</td>' +
      '<td style="padding:8px 6px;color:#a0aec0;font-size:13px;width:70px">' + dateDisplay + '</td>' +
      '<td style="padding:8px 6px;color:' + color + ';font-weight:600">' + emoji + ' ' + label + '</td>' +
      '<td style="padding:8px 6px;color:#cbd5e0;text-align:right;font-variant-numeric:tabular-nums">' + d.inTime + '</td>' +
      '<td style="padding:8px 6px;color:#cbd5e0;text-align:right;font-variant-numeric:tabular-nums">' + d.outTime + '</td>' +
      '<td style="padding:8px 6px;color:#e2e8f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">' + hoursDisplay + '</td>' +
      (otDisplay ? '<td style="padding:8px 6px;color:#ed8936;text-align:right;font-size:12px;font-variant-numeric:tabular-nums">' + otDisplay + '</td>' : '<td></td>') +
      '</tr>';
  }).join('');

  const weekRange = formatDateTH(weekDates[0]) + ' – ' + formatDateTH(weekDates[4]);
  const otHours = Math.round(stats.totalOTMin / 6) / 10; // = otMin/60 รอบ .1

  const empName = (employee.name || 'คุณ').replace(/[<>"'&]/g, '');

  return '<!DOCTYPE html>\n' +
'<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<style>\n' +
'  body { font-family: "Sarabun", -apple-system, sans-serif; margin: 0; padding: 0; background: #0a0612; }\n' +
'  .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a0b2e 0%, #16213e 100%); padding: 36px 24px; }\n' +
'  .logo { text-align: center; font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #b794f4 0%, #ed64a6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 8px; }\n' +
'  .subtitle { text-align: center; color: #718096; font-size: 12px; letter-spacing: 0.1em; margin-bottom: 28px; }\n' +
'  .header { text-align: center; margin-bottom: 24px; }\n' +
'  .header-emoji { font-size: 40px; margin-bottom: 6px; }\n' +
'  .header-msg { color: #e2e8f0; font-size: 20px; font-weight: 700; }\n' +
'  .header-name { color: #b794f4; font-size: 14px; margin-top: 4px; }\n' +
'  .week-range { text-align: center; color: #a0aec0; font-size: 13px; margin-bottom: 24px; }\n' +
'  .kpi-grid { display: table; width: 100%; border-spacing: 8px; margin-bottom: 24px; }\n' +
'  .kpi-row { display: table-row; }\n' +
'  .kpi-cell { display: table-cell; padding: 14px 10px; background: rgba(183, 148, 244, 0.08); border-radius: 12px; border-left: 3px solid #b794f4; text-align: center; width: 33%; }\n' +
'  .kpi-value { font-size: 22px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }\n' +
'  .kpi-label { font-size: 11px; color: #a0aec0; margin-top: 2px; letter-spacing: 0.05em; }\n' +
'  .daily-table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.03); border-radius: 12px; overflow: hidden; margin-bottom: 24px; }\n' +
'  .daily-table th { padding: 10px 6px; color: #718096; font-size: 11px; font-weight: 600; text-align: left; background: rgba(0,0,0,0.2); letter-spacing: 0.05em; }\n' +
'  .daily-table th:nth-child(n+4) { text-align: right; }\n' +
'  .daily-table tr { border-bottom: 1px solid rgba(255,255,255,0.04); }\n' +
'  .daily-table tr:last-child { border-bottom: 0; }\n' +
'  .cta { text-align: center; margin: 24px 0; }\n' +
'  .btn { display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #b794f4 0%, #ed64a6 100%); color: #fff !important; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; }\n' +
'  .footer { text-align: center; color: #4a5568; font-size: 11px; margin-top: 28px; padding-top: 16px; border-top: 1px solid rgba(183, 148, 244, 0.15); }\n' +
'</style>\n' +
'</head><body>\n' +
'  <div class="container">\n' +
'    <div class="logo">RUDY</div>\n' +
'    <div class="subtitle">WEEKLY SUMMARY</div>\n' +
'    <div class="header">\n' +
'      <div class="header-emoji">' + headerEmoji + '</div>\n' +
'      <div class="header-msg">' + headerMsg + '</div>\n' +
'      <div class="header-name">' + empName + '</div>\n' +
'    </div>\n' +
'    <div class="week-range">📅 ' + weekRange + '</div>\n' +
'\n' +
'    <div class="kpi-grid">\n' +
'      <div class="kpi-row">\n' +
'        <div class="kpi-cell"><div class="kpi-value" style="color:#48bb78">' + stats.daysOnTime + '<span style="font-size:13px;opacity:0.5;font-weight:600">/5</span></div><div class="kpi-label">วันตรงเวลา</div></div>\n' +
'        <div class="kpi-cell"><div class="kpi-value" style="color:#ed8936">' + stats.daysLate + '</div><div class="kpi-label">วันสาย</div></div>\n' +
'        <div class="kpi-cell"><div class="kpi-value" style="color:#a0aec0">' + stats.daysMissed + '</div><div class="kpi-label">วันไม่มา</div></div>\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="kpi-grid">\n' +
'      <div class="kpi-row">\n' +
'        <div class="kpi-cell" style="border-left-color:#48bb78"><div class="kpi-value" style="color:#48bb78">' + stats.totalHours + '<span style="font-size:13px;opacity:0.7"> ชม</span></div><div class="kpi-label">ชั่วโมงรวม</div></div>\n' +
'        <div class="kpi-cell" style="border-left-color:#ed8936"><div class="kpi-value" style="color:#ed8936">' + otHours + '<span style="font-size:13px;opacity:0.7"> ชม</span></div><div class="kpi-label">OT รวม</div></div>\n' +
'      </div>\n' +
'    </div>\n' +
'\n' +
'    <table class="daily-table">\n' +
'      <thead><tr>\n' +
'        <th>วัน</th><th>วันที่</th><th>สถานะ</th><th style="text-align:right">เข้า</th><th style="text-align:right">ออก</th><th style="text-align:right">ชม.</th><th></th>\n' +
'      </tr></thead>\n' +
'      <tbody>' + dailyRows + '</tbody>\n' +
'    </table>\n' +
'\n' +
'    <div class="cta">\n' +
'      <a href="https://chitipat-web.github.io/timetrack/" class="btn">เปิด RUDY 🚀</a>\n' +
'    </div>\n' +
'\n' +
'    <div class="footer">\n' +
'      RUDY — Smart HR &amp; Time-tracking<br>\n' +
'      <small style="opacity:0.6">Weekly Summary · ' + weekKey + '</small>\n' +
'    </div>\n' +
'  </div>\n' +
'</body></html>';
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('=== 📊 WEEKLY SUMMARY EMAIL ===');
  console.log('Time (IDT):', getNowInIDT().toLocaleString('th-TH'));
  console.log('DRY_RUN   :', DRY_RUN);
  console.log('FORCE     :', FORCE);

  // ── Init Firebase ─────────────────────────────────
  let db;
  try {
    const serviceAccount = JSON.parse(FIREBASE_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: FIREBASE_DB_URL
    });
    db = admin.database();
  } catch (e) {
    console.error('❌ Firebase init failed:', e.message);
    process.exit(1);
  }

  // ── Week range ────────────────────────────────────
  const weekKey = getWeekKeyIDT();
  const { dates: weekDates } = getWeekRangeIDT();
  console.log('Week key  :', weekKey);
  console.log('Week dates:', weekDates.join(', '));

  // ── Idempotency check ────────────────────────────
  if (!FORCE && !DRY_RUN) {
    try {
      const flagSnap = await db.ref('weekly_summary_log/' + weekKey).once('value');
      if (flagSnap.exists()) {
        const prev = flagSnap.val();
        console.log('⏭️  Already sent for ' + weekKey + ' at ' + (prev && prev.sentAt) + ' — skip');
        console.log('   (set FORCE=true to override)');
        process.exit(0);
      }
    } catch (e) {
      console.warn('⚠️  Idempotency check failed (proceeding anyway):', e.message);
    }
  }

  // ── Fetch data ────────────────────────────────────
  let employees = [];
  let records = [];
  try {
    const [empSnap, recSnap] = await Promise.all([
      db.ref('employees').once('value'),
      db.ref('records').once('value')
    ]);
    const empObj = empSnap.val() || {};
    employees = Object.entries(empObj).map(([uid, data]) => ({
      uid,
      name: (data && data.name) || 'Unknown',
      email: (data && data.email) || null,
      role: (data && data.role) || 'user'
    })).slice(0, MAX_EMPLOYEES);

    const recObj = recSnap.val() || {};
    records = Object.values(recObj).filter(r => r && r.empId && r.date);
  } catch (e) {
    console.error('❌ Fetch data failed:', e.message);
    process.exit(1);
  }

  console.log('Found     :', employees.length, 'employees,', records.length, 'records');

  // ── Setup transporter ─────────────────────────────
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  // ── Send per-employee ─────────────────────────────
  let sentOK = 0, failed = 0, skipped = 0;

  for (const emp of employees) {
    if (!emp.email) {
      console.log('⚠️  ' + emp.name + ' — no email, skip');
      skipped++;
      continue;
    }

    let stats;
    try {
      stats = computeWeeklySummary(emp, records, weekDates);
    } catch (e) {
      console.error('❌ ' + emp.name + ' compute failed:', e.message);
      failed++;
      continue;
    }

    console.log(
      '📊 ' + emp.name +
      ' → ontime=' + stats.daysOnTime +
      ' late=' + stats.daysLate +
      ' missed=' + stats.daysMissed +
      ' hrs=' + stats.totalHours +
      ' ot=' + stats.totalOTMin + 'm'
    );

    let html;
    try {
      html = buildEmailHTML({ employee: emp, stats, weekDates, weekKey });
    } catch (e) {
      console.error('❌ ' + emp.name + ' build email failed:', e.message);
      failed++;
      continue;
    }

    if (DRY_RUN) {
      console.log('   🧪 DRY_RUN — would send to', emp.email, '(', html.length, 'bytes )');
      sentOK++;
      continue;
    }

    try {
      await transporter.sendMail({
        from: 'RUDY <' + GMAIL_USER + '>',
        to: emp.email,
        subject: '📊 RUDY สรุปสัปดาห์ — ' + emp.name,
        html
      });
      console.log('   ✅ Sent');
      sentOK++;
    } catch (e) {
      console.error('   ❌ Send failed:', e.message);
      failed++;
    }
  }

  // ── Set idempotency flag ──────────────────────────
  if (!DRY_RUN && sentOK > 0) {
    try {
      await db.ref('weekly_summary_log/' + weekKey).set({
        sentAt: new Date().toISOString(),
        sentOK,
        failed,
        skipped,
        weekDates
      });
      console.log('✓ Idempotency flag set for', weekKey);
    } catch (e) {
      console.warn('⚠️  Failed to set idempotency flag:', e.message);
      // ไม่ exit เพราะ email ส่งไปแล้ว
    }
  }

  console.log('\n=== Summary ===');
  console.log('Sent OK :', sentOK);
  console.log('Failed  :', failed);
  console.log('Skipped :', skipped);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
