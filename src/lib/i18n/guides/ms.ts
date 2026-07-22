import type { TranslationTree } from "../types";

export const guideMs: TranslationTree = {
  label: "Panduan",
  hide: "Sembunyi",
  show: "Tunjuk",
  whatThisPageDoes: "Apa halaman ini lakukan",
  whyItMatters: "Mengapa ia penting",
  howToUseIt: "Cara menggunakannya",
  bestPractices: "Amalan terbaik",
  moreHelp: "Bantuan lanjut",
  quickStart: "Panduan Permulaan Pantas",
  moreInfo: "Maklumat lanjut",
  pages: {
    dashboard: {
      title: "Papan pemuka",
      what: "Skrin utama untuk pengawasan kehadiran harian — pautan pantas ke kedai, staf dan alat semakan.",
      why: "Pengurus bermula di sini untuk lihat langkah seterusnya dan kemajuan persediaan sebelum laporan.",
      how: {
        "0": "Guna senarai persediaan untuk siapkan konfigurasi awal.",
        "1": "Buka Kedai atau Staf dari pintasan bila perlu ubah tetapan.",
        "2": "Pergi ke Bukti Foto, Semakan Selfie atau Semakan Risiko bila menyiasat pengecualian.",
      },
      bp: {
        "0": "Siapkan senarai persediaan sebelum minta staf punch.",
        "1": "Tandakan halaman ini untuk semakan harian.",
      },
    },
    attendance: {
      title: "Kehadiran",
      what: "Rekod punch langsung dan sejarah dengan pengesahan GPS, lencana isu dan eksport.",
      why: "Ini sumber kebenaran siapa di tapak, bila clock in/out, dan sama ada pengesahan lulus.",
      how: {
        "0": "Pilih julat tarikh dan tapis mengikut kedai atau staf.",
        "1": "Baca lencana isu (punch hilang, GPS lemah, bukti foto, dll.) pada setiap baris atau sel hari.",
        "2": "Eksport CSV untuk gaji atau audit bila tempoh kelihatan betul.",
      },
      bp: {
        "0": "Semak punch yang ditandakan pada hari yang sama jika boleh.",
        "1": "Semak syif terbuka (clock in tanpa clock out) sebelum tutup gaji.",
      },
    },
    reports: {
      title: "Laporan",
      what: "Paparan bulan dan julat yang merumus jam, isu dan corak kehadiran merentas kedai.",
      why: "Rumusan membantu kesan masalah berulang tanpa baca setiap punch.",
      how: {
        "0": "Tukar antara paparan Kehadiran dan Tidak Hadir pada panel laporan.",
        "1": "Paparan bulan untuk jumlah gaji; hari/julat untuk siasatan.",
        "2": "Klik cip isu untuk faham pencetusnya.",
      },
      bp: {
        "0": "Jalankan laporan hujung bulan selepas semua syif tempoh selesai.",
        "1": "Banding kedai bersebelahan jika anda ada banyak lokasi.",
      },
    },
    shops: {
      title: "Kedai",
      what: "Konfigur setiap lokasi: titik GPS, mod indoor, bukti foto/selfie, syif dan kod QR clock.",
      why: "Setiap punch disahkan terhadap GPS dan peraturan kedai — persediaan salah menyebabkan punch gagal.",
      how: {
        "0": "Tambah kedai dengan nama dan koordinat GPS utama (atau beberapa titik GPS).",
        "1": "Aktifkan Mod Keyakinan Indoor untuk mall atau bangunan tinggi.",
        "2": "Tetapkan perlindungan Anti Buddy Punch dan mod pengesahan setiap kedai.",
        "3": "Cetak QR Clock supaya staf buka halaman punch di tapak.",
        "4": "Tambah templat syif dan jadual staf di bawah kad setiap kedai.",
      },
      bp: {
        "0": "Tetapkan radius GPS secara realistik (sering 30–80 m untuk kedai hadapan jalan).",
        "1": "Jana semula QR hanya bila perlu — kod cetak lama tidak lagi berfungsi.",
      },
    },
    staff: {
      title: "Staf",
      what: "Senarai pekerja, tugasan kedai, kod ID dan kad QR untuk pengenalan clock.",
      why: "Hanya staf yang ditugaskan ke kedai boleh punch di sana; kod staf digunakan pada UI clock.",
      how: {
        "0": "Tambah staf dengan nama, kod dan kedai ditugaskan.",
        "1": "Cetak atau kongsi kod QR ID untuk imbas di halaman clock.",
        "2": "Nyahaktifkan staf yang berhenti — jangan padam jika ada sejarah kehadiran.",
      },
      bp: {
        "0": "Guna kod staf pendek unik (cth. MS04).",
        "1": "Tugaskan setiap pekerja aktif ke sekurang-kurangnya satu kedai sebelum punch.",
      },
    },
    "shift-schedule": {
      title: "Jadual syif",
      what: "Waktu kerja setiap kedai: jam tetap atau templat syif dan jadual harian staf.",
      why: "Jadual memacu jam dijangka, label syif pada laporan dan status hari ini pada halaman clock.",
      how: {
        "0": "Buka Admin → Kedai dan pilih satu kedai.",
        "1": "Untuk kedai berasaskan syif, cipta templat kemudian tugaskan staf ke tarikh.",
        "2": "Guna alat salin minggu/hari untuk jadual berulang.",
      },
      bp: {
        "0": "Cipta templat sebelum tugasan pukal jadual.",
        "1": "Kekalkan nama templat konsisten merentas kedai untuk laporan lebih mudah.",
      },
    },
    subscription: {
      title: "Langganan",
      what: "Pelan LW OpsFlow anda, had (kedai/staf) dan status bil.",
      why: "Langganan aktif membuka punch dan ciri admin; percubaan tamat menyekat punch staf.",
      how: {
        "0": "Semak pelan semasa dan kiraan penggunaan.",
        "1": "Pilih pelan dan klik Langgan Sekarang untuk bayar melalui Stripe.",
        "2": "Selesaikan prom langganan diperlukan sebelum staf punch semula.",
      },
      bp: {
        "0": "Naik taraf sebelum capai had kedai atau staf.",
        "1": "Pastikan e-mel hubungan bil dikemas kini di Profil Syarikat.",
      },
    },
    "company-profile": {
      title: "Profil syarikat",
      what: "Nama syarikat, ID untuk log masuk, status pengesahan dan butiran hubungan bil.",
      why: "Data profil tepat menyokong pemulihan akaun, invois dan permintaan sokongan.",
      how: {
        "0": "Salin ID Syarikat untuk log masuk ID Syarikat.",
        "1": "Kemas kini hubungan bil selepas pengesahan e-mel.",
        "2": "Medan baca sahaja sebagai rujukan — hubungi sokongan untuk ubah nama undang-undang.",
      },
      bp: {
        "0": "Simpan ID Syarikat dalam wiki dalaman yang selamat.",
        "1": "Guna peti masuk dipantau untuk e-mel hubungan bil.",
      },
    },
  },
};
