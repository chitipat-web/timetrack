// scripts/lib/ai-content.js
// AI-powered email content generator using Gemini 2.5 Flash
// Used by notify-checkin-email.js and notify-checkout-email.js

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================
// TONE POOL — สุ่มเลือกทุกครั้ง
// ============================================
const TONES = [
  {
    id: 'casual',
    label: 'แซวๆ สนุกสนาน',
    instruction: 'ใช้น้ำเสียงเพื่อนสนิท แซวๆ หยอกล้อ มี humor นิดๆ แต่ไม่หยาบคาย'
  },
  {
    id: 'warm',
    label: 'อบอุ่น ห่วงใย',
    instruction: 'ใช้น้ำเสียงอบอุ่น เหมือนคนในครอบครัวห่วงใย ดูแลกัน'
  },
  {
    id: 'motivational',
    label: 'ปลุกใจ ฮึกเหิม',
    instruction: 'ใช้น้ำเสียงปลุกใจ ให้พลัง สร้างแรงบันดาลใจ แต่ไม่เว่อร์เกินไป'
  },
  {
    id: 'professional',
    label: 'สุภาพ อบอุ่น',
    instruction: 'ใช้น้ำเสียงสุภาพ แต่ไม่ตึงเครียด อบอุ่นเป็นมิตร'
  },
  {
    id: 'humor',
    label: 'ฮา ตลก',
    instruction: 'ใช้น้ำเสียงตลก เล่นมุก แต่ไม่ over จนไม่เคารพ'
  }
];

// ============================================
// VIBE POOL — สุ่ม theme เพิ่มความหลากหลาย
// ============================================
const VIBES = [
  'เปรียบเทียบกับสัตว์ (เช่น แมว หมา นก)',
  'เปรียบเทียบกับอาหาร (เช่น กาแฟ ชา ข้าวเช้า)',
  'เปรียบเทียบกับธรรมชาติ (เช่น พระอาทิตย์ ฝน ลม)',
  'อ้างอิงเกม/หนัง popular',
  'ใช้สำนวนไทยสนุกๆ',
  'มุก dad joke ไทยๆ',
  'แต่งกลอนสั้นๆ 2 บรรทัด',
  'เปรียบเทียบกับ superhero',
  'ใช้คำที่ trending ใน social media',
  'แบบกวนๆ tsundere'
];

// ============================================
// PATTERN ANALYZER — วิเคราะห์ records 7 วันย้อนหลัง
// ============================================
function analyzeEmployeePattern(empId, records, today) {
  // กรอง records ของคนนี้ 7 วันย้อนหลัง (ไม่รวมวันนี้)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const myRecords = records.filter(r =>
    r.empId === empId &&
    r.date >= sevenDaysAgoStr &&
    r.date < today
  );

  if (myRecords.length === 0) {
    return {
      type: 'new',
      label: 'พนักงานใหม่/ยังไม่มี records',
      detail: 'ยังไม่มีข้อมูล 7 วันย้อนหลัง',
      stats: { totalDays: 0 }
    };
  }

  // วิเคราะห์ stats
  const lateCount = myRecords.filter(r => r.isLate).length;
  const totalOT = myRecords.reduce((sum, r) => sum + (r.otMin || 0), 0);
  const noCheckoutCount = myRecords.filter(r => r.checkIn && !r.checkOut).length;

  // คำนวณเวลา check-in เฉลี่ย (HH:MM → minutes)
  const checkInTimes = myRecords
    .filter(r => r.checkIn)
    .map(r => {
      const [h, m] = r.checkIn.split(':').map(Number);
      return h * 60 + m;
    });
  const avgCheckInMin = checkInTimes.length > 0
    ? Math.round(checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length)
    : null;

  const stats = {
    totalDays: myRecords.length,
    lateCount,
    totalOTMin: totalOT,
    noCheckoutCount,
    avgCheckInMin
  };

  // จัดประเภท pattern
  if (lateCount >= 3) {
    return {
      type: 'often_late',
      label: 'สายบ่อย',
      detail: `สาย ${lateCount}/${myRecords.length} วันใน 7 วันที่ผ่านมา`,
      stats
    };
  }

  if (lateCount === 0 && myRecords.length >= 5) {
    return {
      type: 'always_punctual',
      label: 'ตรงเวลาตลอด',
      detail: `ตรงเวลา ${myRecords.length}/${myRecords.length} วันใน 7 วันที่ผ่านมา`,
      stats
    };
  }

  if (totalOT >= 300) { // 5 ชม+ ต่อสัปดาห์
    return {
      type: 'heavy_ot',
      label: 'OT เยอะ',
      detail: `ทำ OT รวม ${Math.round(totalOT / 60)} ชั่วโมง ใน 7 วัน`,
      stats
    };
  }

  if (noCheckoutCount >= 2) {
    return {
      type: 'forgets_checkout',
      label: 'ลืม check-out บ่อย',
      detail: `ลืม check-out ${noCheckoutCount} ครั้งใน 7 วัน`,
      stats
    };
  }

  if (avgCheckInMin !== null && avgCheckInMin < 345) { // เฉลี่ยก่อน 05:45
    return {
      type: 'early_bird',
      label: 'มาเช้ามาก',
      detail: `เฉลี่ย check-in เวลา ${Math.floor(avgCheckInMin / 60)}:${String(avgCheckInMin % 60).padStart(2, '0')}`,
      stats
    };
  }

  return {
    type: 'normal',
    label: 'ปกติ',
    detail: `ทำงานสม่ำเสมอ ${myRecords.length} วันใน 7 วัน`,
    stats
  };
}

// ============================================
// CONTEXT BUILDER — วันในสัปดาห์, วันสำคัญ
// ============================================
function getDayContext(date) {
  // date = Date object (IDT timezone)
  const dayNum = date.getDay(); // 0 = อาทิตย์
  const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  const dayLabel = dayNames[dayNum];
  const dateLabel = `${date.getDate()} ${monthNames[date.getMonth()]}`;

  // วันในสัปดาห์ → vibe
  let weekVibe = '';
  if (dayNum === 1) weekVibe = 'วันจันทร์ — เริ่มสัปดาห์ใหม่ ทีมอาจจะเหนื่อยจากวันหยุด';
  else if (dayNum === 2) weekVibe = 'วันอังคาร — เริ่มสัปดาห์อย่างจริงจัง';
  else if (dayNum === 3) weekVibe = 'วันพุธ — กลางสัปดาห์ ครึ่งทางแล้ว';
  else if (dayNum === 4) weekVibe = 'วันพฤหัสบดี — ใกล้สุดสัปดาห์แล้ว สู้ๆ';
  else if (dayNum === 5) weekVibe = 'วันศุกร์ — สดใส! สุดสัปดาห์มาแล้ว';
  else if (dayNum === 6) weekVibe = 'วันเสาร์ — ทำงานเสาร์ ขยันมาก';
  else weekVibe = 'วันอาทิตย์ — ทำงานวันหยุด เก่งมาก';

  return {
    dayNum,
    dayLabel,
    dateLabel,
    weekVibe
  };
}

// ============================================
// GEMINI API CALLER
// ============================================
async function callGemini(prompt, apiKey) {
  const url = `${GEMINI_URL}?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 1.0, // สูง → หลากหลาย ไม่ซ้ำ
      maxOutputTokens: 2048, // เพิ่มจาก 500 → 2048 (กัน JSON ตัดกลางคัน)
      responseMimeType: 'application/json',
      thinkingConfig: {
        thinkingBudget: 0 // ปิด thinking mode → เร็วขึ้น + ประหยัด tokens
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    // Log finish reason เผื่อ debug
    const finishReason = data?.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`Gemini returned empty response (finishReason: ${finishReason})`);
  }

  // Clean up: บางครั้ง Gemini ใส่ ```json ... ``` มา
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  // parse JSON
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    // ลอง extract JSON object ออกมาด้วย regex (กัน text นำ/ตาม)
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        throw new Error(`JSON parse failed: ${parseErr.message}. Raw: ${text.slice(0, 150)}`);
      }
    } else {
      throw new Error(`JSON parse failed: ${parseErr.message}. Raw: ${text.slice(0, 150)}`);
    }
  }

  if (!parsed.subject || !parsed.body) {
    throw new Error('Gemini JSON missing subject or body');
  }

  return parsed;
}

// ============================================
// MAIN: Generate Check-in Email Content
// ============================================
async function generateCheckinContent({ employee, pattern, dayContext, apiKey }) {
  // สุ่ม tone และ vibe
  const tone = TONES[Math.floor(Math.random() * TONES.length)];
  const vibe = VIBES[Math.floor(Math.random() * VIBES.length)];

  const prompt = `คุณเป็น AI ช่วยเขียน email เตือนเข้างานสำหรับทีม HR/Time-tracking ชื่อ RUDY

ข้อมูลพนักงาน:
- ชื่อ: ${employee.name}
- Pattern 7 วันที่ผ่านมา: ${pattern.label} (${pattern.detail})

Context วันนี้:
- ${dayContext.weekVibe}
- วันที่: ${dayContext.dateLabel}

วิธีการเขียน:
- Tone: ${tone.instruction}
- Vibe พิเศษ: ${vibe}
- ภาษาไทย เป็นกันเอง
- ใช้ emoji 1-2 ตัวเท่านั้น
- เนื้อหา 2-4 บรรทัด ไม่ยาวเกินไป
- อ้างอิง pattern ของพนักงานคนนี้ให้ relevant
- ต้องเตือนให้ check-in ก่อน 06:00 IDT (เวลาเริ่มงาน)
- ห้าม! ใช้คำว่า "ผู้ใช้" หรือ "คุณ" ให้เรียกชื่อหรือใช้สรรพนามเหมาะสม

ตอบเป็น JSON เท่านั้น:
{
  "subject": "หัวข้อ email พร้อม emoji (สั้น กระชับ 5-10 คำ)",
  "body": "เนื้อหา 2-4 บรรทัด ใช้ \\n ขึ้นบรรทัดใหม่"
}`;

  const result = await callGemini(prompt, apiKey);
  return {
    subject: result.subject,
    body: result.body,
    meta: { tone: tone.id, vibe, patternType: pattern.type }
  };
}

// ============================================
// MAIN: Generate Check-out Email Content
// ============================================
async function generateCheckoutContent({ employee, pattern, dayContext, checkInTime, apiKey }) {
  const tone = TONES[Math.floor(Math.random() * TONES.length)];
  const vibe = VIBES[Math.floor(Math.random() * VIBES.length)];

  const prompt = `คุณเป็น AI ช่วยเขียน email เตือนเลิกงาน (check-out) สำหรับทีม RUDY

ข้อมูลพนักงาน:
- ชื่อ: ${employee.name}
- Pattern 7 วันที่ผ่านมา: ${pattern.label} (${pattern.detail})
- วันนี้ check-in ตอน: ${checkInTime || 'ไม่ทราบ'}

Context วันนี้:
- ${dayContext.weekVibe}
- วันที่: ${dayContext.dateLabel}

วิธีการเขียน:
- Tone: ${tone.instruction}
- Vibe พิเศษ: ${vibe}
- ภาษาไทย เป็นกันเอง
- ใช้ emoji 1-2 ตัวเท่านั้น
- เนื้อหา 2-4 บรรทัด ไม่ยาวเกินไป
- เตือนให้ check-out ในแอพ (เพราะตอนนี้ใกล้ 22:00 แล้ว)
- อ้างอิง pattern ของพนักงานคนนี้ให้ relevant
- ถ้า pattern เป็น "ลืม check-out บ่อย" → เน้นย้ำเรื่องนี้
- ถ้า OT เยอะ → ห่วงใยเรื่องพักผ่อน

ตอบเป็น JSON เท่านั้น:
{
  "subject": "หัวข้อ email พร้อม emoji (สั้น กระชับ 5-10 คำ)",
  "body": "เนื้อหา 2-4 บรรทัด ใช้ \\n ขึ้นบรรทัดใหม่"
}`;

  const result = await callGemini(prompt, apiKey);
  return {
    subject: result.subject,
    body: result.body,
    meta: { tone: tone.id, vibe, patternType: pattern.type }
  };
}

// ============================================
// FALLBACK CONTENT — ใช้เมื่อ AI fail
// ============================================
function getFallbackCheckinContent(employee) {
  return {
    subject: '⏰ อย่าลืม Check-in งานวันนี้!',
    body: `สวัสดี ${employee.name}\nถึงเวลาเริ่มงานแล้ว อย่าลืมเปิดแอพ RUDY แล้วกด Check-in ก่อน 06:00 IDT นะครับ\nขอให้วันนี้เป็นวันที่ดี! 💪`,
    meta: { tone: 'fallback', vibe: 'static', patternType: 'unknown' }
  };
}

function getFallbackCheckoutContent(employee) {
  return {
    subject: '🌙 อย่าลืม Check-out ก่อนนอน!',
    body: `สวัสดี ${employee.name}\nก่อนเข้านอน อย่าลืมเปิดแอพ RUDY แล้วกด Check-out นะครับ\nระบบจะได้บันทึกเวลาทำงานครบถ้วน ขอให้พักผ่อนเต็มที่! 🌙`,
    meta: { tone: 'fallback', vibe: 'static', patternType: 'unknown' }
  };
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  analyzeEmployeePattern,
  getDayContext,
  generateCheckinContent,
  generateCheckoutContent,
  getFallbackCheckinContent,
  getFallbackCheckoutContent
};
