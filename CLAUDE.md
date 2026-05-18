# RUDY

## โปรเจกต์
แอป HR / ลงเวลา แบบ PWA ไฟล์เดียว ใช้บน iPhone Safari ทีม 3 คนที่อิสราเอล

ไฟล์หลัก:
- `index.html` (~700KB) — UI + logic + CSS ทั้งหมด
- `sw.js` — service worker
- `version.json` — เวอร์ชันสำหรับ auto-update poller

repo: `chitipat-web/timetrack` · branch: `main` · deploy: GitHub Pages

## กฎ DEPLOY — สำคัญที่สุด ห้ามพลาด

1. **ทุกครั้งที่แก้ `index.html` ต้อง bump เลข version พร้อมกัน 3 ที่
   ให้เป็นเลขเดียวกันเสมอ:**
   - `sw.js` — cache names: `rudy-static-vNNN`, `firebase-vNNN`, `rudy-runtime-vNNN`
   - `sw.js` — ค่า `version: 'vNNN'` ใน message handler `GET_VERSION`
     (และ log strings `[SW vNNN]` กับคอมเมนต์หัวไฟล์)
   - `version.json` — ฟิลด์ `version`

2. **หลัง commit เจ้าของต้องเคลียร์ cache บน iPhone เอง**
   (Claude Code ทำให้ไม่ได้):
   - ลบ PWA ออกจาก home screen
   - ล้าง Safari website data
   - เพิ่ม PWA กลับเข้าใหม่

3. **ห้ามแก้โค้ดหลายร้อยจุดรวดเดียว** — ทำทีละจุด ตรวจ syntax
   ก่อน commit เสมอ

## โครงสร้าง

- โค้ดแบ่งเป็น **Phase A–G** แต่ละ phase เป็น IIFE มี `try/catch` ห่อ
- ระบบ light/dark:
  - ฟังก์ชัน `toggleDark()`
  - toggle ผ่าน class `body.dark` (ที่ `<body>` เท่านั้น ไม่ใช่ `<html>`)
  - CSS variables: `--ink` (สีตัวหนังสือ), `--ink-2/3/4`, `--glass-*` (สีการ์ด)
  - light mode override ด้วย selector `body:not(.dark) { ... }`
- ตัวหนังสือทุกจุด **ควรใช้ `var(--ink)`** ไม่ฮาร์ดโค้ด `color:#fff`
  ยกเว้นข้อความบนปุ่ม / badge / avatar / banner ที่พื้นหลังเป็นสีตายตัว
  อยู่แล้ว (gradient blue/red/green/purple ฯลฯ) — ตรงนั้นขาวถูกต้อง
- `index.html` ไม่มีเลขเวอร์ชันฮาร์ดโค้ด — ดึงจาก `version.json` ผ่าน
  `_hlVersionCache` ตอน runtime (index.html:14780–14797)

## วิธีทำงานกับไฟล์

`index.html` ใหญ่มาก (~700KB / กว่า 15,000 บรรทัด) — เกินขนาดที่ `Read`
จะอ่านทั้งไฟล์ได้ครั้งเดียว

- **ค้นด้วย `grep` ก่อนเสมอ** เพื่อหาเลขบรรทัดของส่วนที่เกี่ยวข้อง
- `Read` เฉพาะช่วง (`offset` + `limit`) รอบบรรทัดที่ grep เจอ
- อย่าพยายามอ่านทั้งไฟล์รวด — เปลือง context และไม่จำเป็น
- รักษา `id` ของ element ที่ JS อ้างถึง เช่น `#btn-in`, `#btn-out`
  (มีหลายจุดใน JS อ้างถึง ลบแล้ว check-in พัง)
