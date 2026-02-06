# 🎸 Mio Bot (Auto Chat Dashboard)

**Mio Bot** adalah aplikasi chat dashboard real-time yang terintegrasi dengan Discord Bot. Aplikasi ini memungkinkan Anda untuk mengirim pesan, gambar, dan mention ke server Discord melalui antarmuka web yang aesthetic bertema K-ON!

![Mio Bot Dashboard Preview](https://i.pinimg.com/originals/ba/42/f8/ba42f8cf58ac119fdbc4256d39769d36.gif)

## ✨ Fitur Utama

- **Real-time Dashboard**: Pantau pesan masuk dari Discord secara langsung.
- **Kirim Pesan & Gambar**: Kirim pesan teks dan upload gambar (preview tersedia) ke channel Discord.
- **Smart Mentions**: Dukungan mention User (`@user`), Role, `@everyone`, dan `@here`.
- **Responsive Design**: Tampilan optimal di Desktop, Tablet, dan Mobile.
- **K-ON Aesthetic**: Tema visual Mio Akiyama dengan background GIF dan animasi.
- **Login System**: Halaman login secure dengan validasi username/password.

## 🛠️ Teknologi

- **Frontend**: [Astro](https://astro.build), Vanilla CSS, WebSocket APIs.
- **Backend (Bot)**: Node.js, [Discord.js](https://discord.js.org/), `ws` (WebSocket library).
- **Environment**: `.env` untuk keamanan token.

## 🚀 Cara Instalasi

### 1. Prasyarat
- Node.js (v18 atau lebih baru)
- Akun Discord & Bot Token (dari [Discord Developer Portal](https://discord.com/developers/applications))

### 2. Clone Project
```bash
git clone https://github.com/username/mio-auto-chat.git
cd mio-auto-chat
```

### 3. Setup Dependencies
Project ini memiliki 2 bagian yang perlu di-install dependencies-nya:

**Install Root (Frontend):**
```bash
npm install
```

**Install Bot (Backend):**
```bash
cd bot
npm install
cd ..
```

### 4. Konfigurasi Environment (.env)

Buat file `.env` di folder `bot/`:
```bash
# File: bot/.env
DISCORD_TOKEN=masukkan_token_bot_discord_disini
```

> **Catatan Penting**: Pastikan Bot Anda sudah diaktifkan **Privileged Gateway Intents** (Message Content, Server Members, Presence) di Discord Developer Portal.

## 🎮 Cara Menjalankan

Aplikasi ini membutuhkan **2 terminal** yang berjalan bersamaan.

### Terminal 1: Jalankan Bot (Backend)
```bash
cd bot
node index.js
```
*Tunggu hingga muncul pesan: `✅ Login successful! ... 📡 WebSocket server running`*

### Terminal 2: Jalankan Website (Frontend)
```bash
npm run dev
```
*Website akan berjalan di: `http://localhost:4321`*

## 🔐 Login Info

Buka browser dan akses `http://localhost:4321`.
Gunakan kredensial default berikut (bisa diubah di `src/pages/index.astro`):

- **Username**: `BudiRajaIblis`
- **Password**: `BoediGanteng`

## 📱 Panduan Penggunaan

1. **Login** ke dashboard.
2. **Pilih Server** dari sidebar kiri.
3. **Pilih Channel** text yang ingin dikirimi pesan.
4. **Ketik Pesan** atau **Upload Gambar** (klik ikon kamera/attach).
5. Klik tombol **Kirim (➤)** atau tekan **Enter**.
6. Gunakan tombol **Logout** di pojok kanan atas untuk keluar.

## ⚠️ Troubleshooting

- **Bot Gagal Login?**
  - Cek apakah Token Discord di `bot/.env` sudah benar.
  - Pastikan Intents sudah dicentang di Developer Portal.
- **Pesan Tidak Terkirim?**
  - Pastikan Bot memiliki permission `Administrator` atau minimal `Send Messages` & `View Channels` di server Discord.
- **Status "Disconnected" di Dashboard?**
  - Pastikan `node index.js` masih berjalan dan tidak error.
  - Refresh halaman web.

## 📄 Struktur Folder

```text
/
├── bot/                 # Backend Discord Bot
│   ├── index.js         # Logic Bot & WebSocket Server
│   └── .env             # Token Bot
├── public/              # Aset statis (gambar, favicon)
├── src/
│   ├── layouts/         # Layout utama web
│   ├── pages/
│   │   ├── index.astro  # Halaman Login
│   │   └── dashboard.astro # Halaman Dashboard Utama
│   └── styles/
│       └── dashboard.css # Styling CSS
└── package.json
```

---
*Created with ❤️ by Mio Bot Team*
