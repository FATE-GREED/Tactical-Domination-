// ====================================================================
// mp-config.js — Pengaturan Mode Multiplayer (v12). Isi DUA nilai di bawah, lalu simpan.
//
// Cara mendapatkannya (gratis, tanpa kartu kredit, tanpa membuat tabel):
//   1. Daftar di https://supabase.com lalu buat satu Project baru (paket Free).
//   2. Buka Project Settings -> API.
//   3. Salin "Project URL" ke url, dan "anon public" key ke anonKey.
// Game hanya memakai Supabase Realtime (Broadcast + Presence) — tidak ada database yang perlu disiapkan.
// Pastikan di Project Settings -> Realtime, opsi "Allow public access" / channel publik tidak dimatikan.
// anonKey memang boleh ada di kode klien (kunci publik); JANGAN pernah menaruh service_role key di sini.
// Jika dibiarkan kosong, layar Multiplayer akan menampilkan petunjuk ini.
// ====================================================================
const MP_CONFIG = {
  url: 'https://teyazolabmvxlrtlzjqw.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRleWF6b2xhYm12eGxydGx6anF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDcyODAsImV4cCI6MjEwODEyMzI4MH0.mq-1yuYRGb0LZR-Ui8-64heUohDul27NtonW1mrS6GM',
};
