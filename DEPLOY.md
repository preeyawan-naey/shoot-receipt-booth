# Deploy SHOOT Receipt BOOTH to Cloud

ให้ทุกคนสแกน QR ดาวน์โหลดรูปได้ (4G / Wi‑Fi คนละเครือข่าย)

## วิธีที่ 1: Railway (แนะนำ — ง่ายที่สุด)

1. สร้างบัญชี [Railway](https://railway.app)
2. New Project → Deploy from GitHub repo นี้
3. ตั้ง **Root Directory** = `backend` (หรือ deploy ทั้ง repo ด้วย Dockerfile)
4. ตั้ง Environment Variables:
   ```
   PUBLIC_URL=https://your-app.up.railway.app
   ```
5. Deploy แล้ว copy URL จริงจาก Railway → ใส่ใน `PUBLIC_URL` → Redeploy
6. เปิด `https://your-app.up.railway.app` ใช้งาน booth ได้เลย

## วิธีที่ 2: Render

1. สร้างบัญชี [Render](https://render.com)
2. New → Blueprint → เลือก repo (ใช้ `render.yaml`)
3. ตั้ง `PUBLIC_URL` ใน Environment
4. Deploy

## วิธีที่ 3: Supabase Storage (แนะนำสำหรับ production)

รูปไม่หายเมื่อ server restart (Render/Railway free tier ลบไฟล์ local)

### Setup Supabase

1. สร้าง project ที่ [supabase.com](https://supabase.com)
2. Storage → New bucket ชื่อ `photos` → **Public bucket** ✅
3. Settings → API → copy **Project URL** และ **service_role key**

### Environment Variables

```
PUBLIC_URL=https://your-app.up.railway.app

SUPABASE_ENABLED=true
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_BUCKET=photos
```

> Supabase เปิดได้เมื่อตั้ง `SUPABASE_ENABLED=true` เท่านั้น

QR จะชี้ไป URL สาธารณะบน Supabase โดยตรง — โหลดได้เร็วและทุกที่

## Local Development

```bash
cd backend
cp .env.example .env
npm install
node server.js
```

เปิด `http://localhost:3000`

## ตรวจสอบว่า deploy สำเร็จ

```bash
curl https://your-app.up.railway.app/api/health
```

ควรได้:
```json
{"ok":true,"storageMode":"local","publicUrl":"https://your-app.up.railway.app"}
```

## Flow

```
ถ่ายรูป → กดปริ้น → upload รูป (+ QR) → backend เก็บไฟล์
         → สร้าง QR ด้วย PUBLIC_URL (หรือ Supabase URL)
         → มือถือสแกน QR → ดาวน์โหลดรูปได้ทุกที่
```

## หมายเหตุ

- **PUBLIC_URL** ต้องเป็น URL สาธารณะที่มือถือเข้าถึงได้ (HTTPS)
- อย่าใช้ `localhost` หรือ `192.168.x.x` ใน production
- Booth ตู้ถ่ายรูปเปิดผ่าน URL cloud เดียวกับ backend
