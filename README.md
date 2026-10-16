# Jurnal Sync

Jurnal.html + server kecil agar data tersinkron antara HP dan PC.

## Deploy ke Railway
1. Upload folder ini ke repo GitHub, lalu di Railway: New Project → Deploy from GitHub repo.
2. Tab **Variables**, tambahkan:
   - `APP_PASSWORD` = password pilihanmu
   - `DATA_DIR` = `/data`
3. Tab **Settings** → **Volumes** → Add Volume, mount path `/data` (wajib, supaya data tidak hilang saat redeploy).
4. Settings → Networking → Generate Domain. Buka domainnya di HP dan PC, masukkan password.
5. HP: menu browser → "Tambahkan ke Layar Utama" (jadi seperti aplikasi).

## Catatan
- Data lama di browser PC otomatis ter-upload saat pertama kali dibuka (jika server masih kosong).
- Jika perangkat lain mengubah data, muncul banner "muat ulang". Jika offline, perubahan disimpan lokal lalu dikirim saat online lagi.
- Backup: `/api/export` (butuh header `x-app-key`), dan server menyimpan backup harian 14 hari di `DATA_DIR`.
- Jalankan lokal: `APP_PASSWORD=xxx npm start` lalu buka http://localhost:3000
