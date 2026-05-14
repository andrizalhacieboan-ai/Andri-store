# Andri Store x Pakasir

Landing page Neo-Brutalism untuk Andri Store sebagai agen/penyedia integrasi Pakasir Payment Gateway.

## Jalankan lokal

```bash
npm start
```

Website berjalan di `http://localhost:3000`.

## Link domain agen

Semua tombol utama memakai route internal agar mudah diganti saat domain/referral Anda sudah siap:

- `/docs` diarahkan ke `DOCS_URL` atau default `https://pakasir.com/p/docs`.
- `/daftar` diarahkan ke `SIGNUP_URL` atau default `https://app.pakasir.com`.

Contoh konfigurasi di Vercel Environment Variables:

```bash
DOCS_URL=https://domain-anda.com/docs-pakasir
SIGNUP_URL=https://link-referral-atau-partner-anda
```

## Demo logic Pakasir

Endpoint `POST /api/payment-url` mengikuti logic dari contoh `pakasir.ts`:

- sanitize `order_id` agar aman dipakai di URL;
- validasi `order_id` minimal 5 karakter;
- validasi nominal minimal Rp500, kecuali PayPal minimal Rp10.000;
- dukungan metode `all`, `qris`, `paypal`, `cimb_niaga_va`, `bni_va`, `sampoerna_va`, `bnc_va`, `maybank_va`, `permata_va`, `atm_bersama_va`, `artha_graha_va`, dan `bri_va`;
- estimasi fee QRIS/VA/PayPal dan `total_payment`;
- `expired_at` otomatis 24 jam dari waktu pembuatan payload demo.

Daftar metode demo tersedia di `GET /api/payment-methods`.

> Catatan: fee, bonus, atau komisi mengikuti program dan ketentuan resmi Pakasir.
