# RUDY — คู่มือสำหรับ Claude

## โปรเจกต์
RUDY เป็น PWA ลงเวลา / HR ของทีม 3 คน รันบน iPhone Safari เป็นหลัก
โครงสร้างไฟล์เดียว:

- `index.html` (~700KB) — UI + logic + CSS ทั้งหมด
- `sw.js` — service worker
- `version.json` — เวอร์ชันสำหรับ auto-update poller

## กฎ Deploy (สำคัญที่สุด)

ทุกครั้งที่แก้ `index.html` ต้องบัมพ์เลขเวอร์ชันให้ตรงกัน **ทั้ง 3 จุด**:

1. `sw.js` — cache name **3 ตัว** ต้องตรงกันหมด:
   - `STATIC_CACHE = 'rudy-static-vNNN'`
   - `FIREBASE_CACHE = 'firebase-vNNN'`
   - `RUNTIME_CACHE = 'rudy-runtime-vNNN'`
   - และ log strings ใน `sw.js` ที่เขียน `[SW vNNN]` รวมถึง message handler `GET_VERSION` ที่ตอบ `{ version: 'vNNN' }`
2. `version.json` — `{ "version": "vNNN", "updated": "YYYY-MM-DD" }`
3. คอมเมนต์หัวไฟล์ `sw.js` (`Service Worker vNNN`, `Cache: rudy-static-vNNN, firebase-vNNN`)

`index.html` **ไม่มี** เลขเวอร์ชันฮาร์ดโค้ด — ดึงจาก `version.json` ผ่าน
`_hlVersionCache` ตอน runtime (ดูคอมเมนต์ที่ index.html:14780–14797)

## วิธี Deploy

เจ้าของอัปโหลดผ่าน **GitHub web UI ทีละไฟล์** (ไม่ได้ใช้ CLI / CI)
หลัง deploy ต้อง:

1. บน iPhone Safari ลบ PWA ออกจาก home screen
2. เคลียร์ cache Safari (Settings → Safari → Clear History and Website Data)
3. เปิดเว็บใหม่ แล้ว Add to Home Screen อีกครั้ง

หมายเหตุ: SW มี auto-update poller ที่อ่าน `version.json` แบบ network-only
แต่บน iOS Safari บางครั้งไม่จับการอัปเดต ต้องทำมือตามขั้นตอนข้างบน

## โครงสร้าง index.html

- แบ่งเป็น **Phase A–G** แต่ละ phase เป็น IIFE มี try/catch ครอบ
- ระบบธีม light/dark ใช้:
  - CSS variables `--ink`, `--ink-2/3/4`, `--glass-*`
  - toggle ผ่าน class `body.dark` (toggle ที่ `<body>` เท่านั้น ไม่ใช่ `<html>`)
  - light mode override ด้วย `body:not(.dark) { ... }`
  - ฟังก์ชันสลับ: `toggleDark()`

## กฎการแก้โค้ด

- **ห้ามแก้หลายร้อยจุดรวดเดียว** — ทำทีละจุด commit เป็นชุดเล็กๆ
- **ทดสอบ syntax ก่อน commit เสมอ** (HTML/JS/CSS parse ได้)
- บัมพ์ version ก่อน push ทุกครั้งที่แตะ `index.html`
- รักษา id ของ element ที่ JS อ้างถึง — เช่น `#btn-in`, `#btn-out`
  มีหลายจุดใน JS อ้างถึง id เหล่านี้ ถ้าลบจะ crash check-in

## รูปแบบสีขาว `color:#fff` ที่ใช้ทั่วไฟล์

ทุกที่ที่ฮาร์ดโค้ด `color:#fff` ปัจจุบันอยู่บน background สีตายตัวเสมอ
(ปุ่ม gradient / badge / avatar / banner / overlay / splash) — **ขาวถูกต้อง
ไม่ต้องเปลี่ยนเป็น `var(--ink)`** เพราะ bg ไม่เปลี่ยนตามธีม
