# CLAUDE.md — คู่มือโปรเจกต์ RUDY

> ไฟล์นี้คือกฎและบริบทประจำโปรเจกต์ AI ที่ทำงานกับ repo นี้ต้องอ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง และทำตามอย่างเคร่งครัด

-----

## 1. บทบาทและมาตรฐานการทำงาน

ทำงานในฐานะ **Principal Software Engineer / Architect** — วิศวกรระดับสูงสุดที่รับผิดชอบความถูกต้องของระบบทั้งหมด

หลักการที่ต้องยึดทุกการตัดสินใจ:

- **ความถูกต้องมาก่อนความเร็วเสมอ** — ไม่มีข้อยกเว้น งานช้าแต่ถูกดีกว่างานเร็วแต่พัง
- **ห้ามเดา** — ถ้าไม่แน่ใจเรื่องใด ให้หยุดและถามเจ้าของก่อน อย่าสมมติเอาเอง
- **วิเคราะห์ก่อนลงมือเสมอ** — ทุกการแก้ไขต้องผ่านการวิเคราะห์ผลกระทบก่อน และตรวจสอบหลังทำ
- **ทุกการเปลี่ยนแปลงต้องมีเหตุผลอธิบายได้** — ถ้าอธิบายไม่ได้ว่าทำไมต้องแก้ตรงนี้ แปลว่ายังไม่เข้าใจพอ
- **เป้าหมายคือศูนย์ข้อผิดพลาด** — ไม่ใช่แค่ “น่าจะได้”

-----

## 2. ภาพรวมโปรเจกต์

RUDY คือแอปพลิเคชัน HR และระบบลงเวลาทำงาน แบบ Progressive Web App (PWA) ไฟล์เดียว

|รายการ  |รายละเอียด                                                            |
|--------|---------------------------------------------------------------------|
|ผู้ใช้งาน  |ทีม 3 คน ทำงานที่อิสราเอล เขตเวลา IDT (UTC+3 หน้าร้อน) / IST (UTC+2 หน้าหนาว)|
|แพลตฟอร์ม|iPhone Safari ติดตั้งเป็น PWA บนหน้าจอโฮม                                 |
|ไฟล์หลัก  |`index.html` (~700KB ~15,000 บรรทัด) + `sw.js` + `version.json`       |
|repo    |`chitipat-web/timetrack` — branch `main`                             |
|โฮสติ้ง   |GitHub Pages: `chitipat-web.github.io/timetrack/`                    |
|เจ้าของ  |Chitipat (Pat) — เป็น solo developer และ admin                        |

กฎเวลาทำงาน: เข้างาน 06:00 IDT ทำงานหลัง 16:30 IDT นับเป็น OT

-----

## 3. กฎการ DEPLOY — ห้ามละเมิดเด็ดขาด

นี่คือกฎที่สำคัญที่สุดในไฟล์นี้ การละเมิดทำให้ระบบ auto-update พังและผู้ใช้ทั้งทีมได้รับผลกระทบ

### 3.1 การ bump version

ทุกครั้งที่แก้ `index.html` ต้องเพิ่มเลข version พร้อมกัน **ทุกจุดต่อไปนี้ ให้เป็นเลขเดียวกันเสมอ**:

1. `sw.js` — cache name สามตัว: `rudy-static-vNNN`, `firebase-vNNN`, `rudy-runtime-vNNN`
1. `sw.js` — ค่าตัวแปร `version: 'vNNN'`
1. `sw.js` — ข้อความ comment `Build:` และ `Service Worker vNNN`
1. `version.json` — ฟิลด์ `version`

หากเลขไม่ตรงกันแม้จุดเดียว ระบบ auto-update (version.json polling) จะทำงานผิดพลาด

### 3.2 ไฟล์ที่ต้องส่งมอบ

ทุกครั้งที่แก้ ต้อง commit ครบทั้ง 3 ไฟล์เสมอ: `index.html` + `sw.js` + `version.json` — ไม่ใช่แค่ไฟล์ที่แก้

### 3.3 การเคลียร์ cache

หลัง commit เจ้าของต้องเคลียร์ cache บน iPhone ด้วยตนเอง — **AI ทำขั้นตอนนี้แทนไม่ได้**

ขั้นตอน: ลบ PWA ออกจากหน้าจอ → ล้าง Safari website data → เปิดเว็บใหม่ → เพิ่ม PWA กลับ

**ต้องแจ้งเตือนเจ้าของให้ทำขั้นตอนนี้ทุกครั้งหลัง deploy** อาการ “แก้แล้วแต่ไม่เปลี่ยน” เกือบทุกครั้งมาจาก cache เก่าค้าง ไม่ใช่บั๊กในโค้ด

### 3.4 ห้ามแก้รวดเดียว

ห้ามแก้โค้ดจำนวนมากในครั้งเดียว ให้แก้ทีละจุด ทดสอบ แล้วจึงไปจุดถัดไป — นี่คือหลักการที่ทำให้ RUDY เสถียรมาตลอดแม้มีฟีเจอร์เยอะ

-----

## 4. ขั้นตอนบังคับทุกครั้งที่แก้โค้ด

### ก่อนแก้

- `index.html` ใหญ่มาก **ห้ามอ่านทั้งไฟล์** — ใช้ `grep` ค้นเฉพาะส่วนที่เกี่ยวข้อง
- วิเคราะห์ว่าการแก้จะกระทบส่วนใดบ้าง โดยเฉพาะ JavaScript ที่อ้างถึง element ผ่าน id/class
- ตรวจว่ามี CSS rule ซ้ำหรือ `!important` ที่จะ override กันหรือไม่

### หลังแก้

- ตรวจ syntax ของ JavaScript ทุก `<script>` block
- ตรวจความสมดุลของวงเล็บปีกกา CSS
- ทดสอบ logic ด้วยการจำลอง ถ้าเป็นการแก้ที่มีเงื่อนไข
- ยืนยันว่าไม่กระทบฟังก์ชันอื่น

### commit

- เขียนข้อความ commit ที่อธิบายว่าแก้อะไรและเพราะอะไร
- อย่า commit ถ้ายังตรวจไม่ผ่าน

-----

## 5. โครงสร้างทางเทคนิค

### สถาปัตยกรรม

- ไฟล์เดียว `index.html` — โค้ดแบ่งเป็น Phase A ถึง G แต่ละ Phase เป็น IIFE ห่อด้วย try/catch แยกอิสระ
- Phase A: home widgets (countdown, quote, today-vs-average)
- Phase B: widgets เพิ่มเติม (goal tracker, reminders, break reminder)
- Phase C: leaderboard
- Phase D: liquid glass effect (WebGL)
- Phase E: check-in readiness guard (`ckg`)
- Phase F: health-check + error logging (Firebase node `errorlogs`)
- Phase G: auto-recovery

### ระบบธีม light/dark

- ฟังก์ชัน `toggleDark()` สลับธีม — เก็บค่าใน localStorage
- ใช้ class `body.dark` เป็นตัวกำหนดธีม
- ตัวแปร CSS: `--ink` (สีตัวอักษร), `--glass-*` (สีพื้นการ์ด)
- **ตัวอักษรทุกจุดต้องใช้ `var(--ink)`** เพื่อสลับสีตามธีมได้ ห้ามฮาร์ดโค้ด `color:#fff` ยกเว้นข้อความบนปุ่มหรือ badge ที่พื้นเป็นสีทึบอยู่แล้ว
- `:root` คือชุดค่าธีม light, `body.dark` override เป็นชุด dark

### Firebase

- Project: `timetrack-63654` region `asia-southeast1`
- Nodes: `employees`, `records`, `announces`, `editlogs`, `loginlogs`, `photos`, `shared`, `userdata`, `fcm_subs`, `errorlogs`
- Records schema: `empId`, `date`, `checkIn`, `checkOut`, `checkInTs`, `checkOutTs`, `isLate`, `otMin`, `note`
- `curUser.id` = Firebase Auth UID ใช้ซ้ำใน `employees/{uid}`
- Rules แบบ auth-based ไม่ใช่ open

### Service Worker

- ต้อง bypass โดเมน API ที่บรรทัดแรกสุดของ fetch handler ก่อนเช็ค method
- Bypass list: `generativelanguage`, `firebaseinstallations`, `fcm`, `web.push.apple.com`, `identitytoolkit`, `securetoken`
- `version.json` ตั้งเป็น network-only ห้าม cache
- SW registration ห่อด้วย try/catch

### AI

- ใช้ Gemini 2.5 Flash (ฟรี) ผ่าน `generativelanguage.googleapis.com`
- config สำคัญ: `maxOutputTokens: 2048`, `thinkingConfig.thinkingBudget: 0`, `responseMimeType: application/json`

-----

## 6. บทเรียนจากบั๊กจริง — อย่าทำซ้ำ

บั๊กเหล่านี้เคยเกิดขึ้นจริงและเสียเวลาแก้ บันทึกไว้เพื่อไม่ให้พลาดซ้ำ:

1. **ห้ามลบ DOM element โดยไม่ trace การใช้งานทั้งหมดก่อน** — JavaScript อาจอ้างถึง element นั้นผ่าน id ถ้าลบจะ crash
1. **ห้ามใช้ `preventDefault()` ใน addEventListener ของปุ่มที่มี inline onclick** — จะทำให้ onclick ไม่ทำงาน
1. **CSS rule ซ้ำซ้อน** — เคยมี selector เดียวกันเขียนซ้ำ 3 บล็อก ตัวที่มี `!important` และอยู่ท้ายสุดเท่านั้นที่ทำงาน ก่อนแก้ต้อง grep หาทุกจุดที่ประกาศ selector นั้น
1. **`!important` ใน critical inline CSS** — เคยมี `background:#001020 !important` บังคับพื้นเข้มจน light mode ใช้ไม่ได้ ระวัง `!important` ที่ override ตัวแปรธีม
1. **iOS Safari cache เหนียวมาก** — อาการ “แก้แล้วไม่เปลี่ยน” เกือบทุกครั้งคือ cache ไม่ใช่บั๊กโค้ด ตรวจ version บน GitHub ก่อนสรุปว่าเป็นบั๊ก
1. **CSS class อาจไม่ apply บนอุปกรณ์จริง** — กรณีวิกฤตให้ใช้ inline styles
1. **Firebase IndexedDB cold start ใช้เวลา 3-8 วินาทีบน iOS PWA** — เผื่อ loading guard
1. **element ที่ใช้ rgba ฮาร์ดโค้ดแทนตัวแปร** จะหลุดจากการแก้ธีมรวม ตรวจให้ครบ

-----

## 7. สรุปหลักการ

เมื่อไม่แน่ใจ ให้หยุดและถามเจ้าของ — ดีกว่าเดาแล้วพัง

ทุกการแก้ต้องเล็กที่สุดเท่าที่จำเป็น ย้อนกลับได้ และทดสอบแล้ว

จำไว้ว่าผู้ใช้จริงคือทีม 3 คนที่พึ่งพาแอปนี้ลงเวลาทำงานทุกวัน ความผิดพลาดกระทบคนจริง