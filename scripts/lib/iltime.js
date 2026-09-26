// scripts/lib/iltime.js
// Israel wall-clock helpers for the scheduled push scripts. GitHub cron is
// UTC-only and Israel switches IDT (UTC+3) <-> IST (UTC+2), so each workflow
// schedules BOTH candidate UTC times and the script sends only when the
// Israel time is inside its window, once per Israel date (dedupe in RTDB
// under pushlog/{name}, written with the Admin SDK).

function ilNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const g = t => (parts.find(p => p.type === t) || {}).value;
  const hour = parseInt(g('hour'), 10) % 24, minute = parseInt(g('minute'), 10);
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour, minute, min: hour * 60 + minute };
}

function hmToMin(hm) {
  const [h, m] = String(hm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// true when fromMin <= now < toMin (Israel minutes of day)
function inWindow(now, fromMin, toMin) {
  return now.min >= fromMin && now.min < toMin;
}

// Returns true if this is the first send for `name` on Israel date `day`
// (and records it). Manual runs pass force=true to skip the window but still
// log the send.
async function claimOncePerDay(db, name, day) {
  const ref = db.ref('pushlog/' + name);
  const res = await ref.transaction(cur => (cur === day ? undefined : day));
  return res.committed;
}

module.exports = { ilNow, hmToMin, inWindow, claimOncePerDay };
