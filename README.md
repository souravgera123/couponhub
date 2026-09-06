# CouponHub — Real-time Production Starter

This is a production-oriented starter for CouponHub with:
- Supabase Auth + Postgres
- Supabase Realtime for live coupon/order updates
- Admin dashboard
- Coupon CRUD
- Customer order creation
- Razorpay order/payment verification hooks
- Custom-domain deployment notes

## 1) Create Supabase
Create a Supabase project. In SQL Editor run `supabase/schema.sql`.
Then copy the Project URL and anon key into `public/config.js`.

## 2) Configure admin
Create an account in Supabase Auth. Then in SQL Editor run:
UPDATE public.profiles SET role='admin' WHERE email='YOUR_ADMIN_EMAIL';

## 3) Run locally
Node 18+:
npm install
copy .env.example .env
npm start

Open http://localhost:3000

## 4) Razorpay
Put Razorpay Key ID in `.env`. Keep the Key Secret ONLY on the server.
Set your webhook to `/api/razorpay/webhook` and configure the signing secret.
The payment UI in this starter uses Razorpay Checkout; fulfillment happens only after server-side verification.

## 5) Deploy
Deploy the Node app to a host that supports Node (Render, Railway, Fly.io, etc.).
Add environment variables there.
For a custom domain, point the domain's DNS to your host and enable HTTPS.

IMPORTANT:
- Do not commit `.env`.
- Replace placeholder Supabase/Razorpay values.
- Before public launch, add email delivery, refund handling, rate limiting, logging, backups, and legal pages.
