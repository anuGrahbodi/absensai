const express = require('express');
const cors = require('cors');
const db = require('./db');
const { uploadPhoto } = require('./cloudinary');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow frontend to communicate with backend
app.use(express.json({ limit: '10mb' })); // Increase limit for large JSON arrays (face descriptors)

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

// Test Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

/**
 * GET /api/users
 * Retrieves all registered users and their face descriptors (with JSON protection)
 */
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT nim, face_descriptor, face_descriptor2 FROM users');
    
    // Parse the JSON string back into an array for the frontend with try-catch
    const users = rows.map(row => {
      let desc1 = null;
      let desc2 = null;
      
      try { 
        if (row.face_descriptor) desc1 = JSON.parse(row.face_descriptor); 
      } catch (e) { 
        console.error(`Format wajah tidak valid untuk NIM: ${row.nim}`); 
      }
      
      try { 
        if (row.face_descriptor2) desc2 = JSON.parse(row.face_descriptor2); 
      } catch (e) { 
        console.error(`Format wajah ke-2 tidak valid untuk NIM: ${row.nim}`); 
      }
      
      return {
        nim: row.nim,
        descriptor: desc1,
        descriptor2: desc2
      };
    }).filter(u => u.descriptor !== null); // Hanya kirim data yang valid
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Gagal mengambil data pengguna dari database.' });
  }
});

/**
 * GET /api/attendance/today (GLOBAL)
 * Mengambil JUMLAH TOTAL aktivitas absensi hari ini untuk semua orang
 * Menggunakan perbaikan zona waktu (+7 Jam WIB)
 */
app.get('/api/attendance/today', async (req, res) => {
  try {
    const query = `
      SELECT COUNT(*) as total FROM attendance 
      WHERE DATE(DATE_ADD(timestamp, INTERVAL 7 HOUR)) = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR))
    `;
    const [rows] = await db.query(query);
    res.json({ total: rows[0].total });
  } catch (error) {
    console.error('Error fetching global attendance:', error);
    res.status(500).json({ error: 'Gagal mengambil total presensi.' });
  }
});

/**
 * POST /api/request-otp
 * Generates an OTP, stores it in Database, and sends via email
 */
app.post('/api/request-otp', async (req, res) => {
  const { nim } = req.body;
  if (!nim) return res.status(400).json({ error: 'NIM wajib diisi.' });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 menit dari sekarang

  try {
    // Simpan ke Database (Replace/Update jika NIM sudah pernah minta OTP)
    await db.query(
      'INSERT INTO otp_requests (nim, otp, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE otp = ?, expires_at = ?',
      [nim, otp, expiresAt, otp, expiresAt]
    );

    console.log(`[OTP GENERATED] NIM: ${nim}, OTP: ${otp}`);

    // Try to send email (if configured)
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: '"Absensi AI" <no-reply@absensiai.com>',
          to: 'bpjstkadmin@gmail.com',
          subject: `Permintaan OTP Registrasi Wajah - NIM: ${nim}`,
          html: `
            <h3>Permintaan OTP Registrasi Ulang Wajah</h3>
            <p>Seseorang dengan NIM <b>${nim}</b> sedang mencoba meregistrasi ulang wajahnya.</p>
            <p>Berikan kode OTP berikut kepada pengguna jika diverifikasi:</p>
            <h2 style="color: #4f46e5; letter-spacing: 5px;">${otp}</h2>
            <p><i>Kode OTP ini akan kadaluwarsa dalam 5 menit.</i></p>
          `
        });
        console.log('OTP email sent to bpjstkadmin@gmail.com');
      } catch (err) {
        console.error('Failed to send OTP email:', err.message);
      }
    } else {
      console.log('SMTP not configured, skipping email delivery.');
    }

    res.json({ success: true, message: 'OTP berhasil di-generate dan dikirim ke Admin.' });
  } catch (error) {
    console.error('Error saving OTP:', error);
    res.status(500).json({ error: 'Gagal memproses OTP.' });
  }
});

/**
 * POST /api/verify-otp
 * Validates the submitted OTP against the Database
 */
app.post('/api/verify-otp', async (req, res) => {
  const { nim, otp } = req.body;
  
  if (!nim || !otp) {
    return res.status(400).json({ error: 'NIM dan OTP wajib diisi.' });
  }

  try {
    // Ambil OTP dari Database
    const [rows] = await db.query('SELECT * FROM otp_requests WHERE nim = ?', [nim]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'OTP belum diminta. Silakan minta ulang OTP.' });
    }

    const storedData = rows[0];

    // Cek Kadaluwarsa
    if (Date.now() > storedData.expires_at) {
      await db.query('DELETE FROM otp_requests WHERE nim = ?', [nim]); // Hapus OTP basi
      return res.status(400).json({ error: 'OTP sudah kadaluwarsa. Silakan minta ulang OTP.' });
    }

    // Cek Kecocokan
    if (storedData.otp !== otp) {
      return res.status(400).json({ error: 'Kode OTP tidak valid.' });
    }

    // Jika Benar, hapus OTP agar tidak bisa dipakai 2x
    await db.query('DELETE FROM otp_requests WHERE nim = ?', [nim]);
    
    res.json({ success: true, message: 'OTP diverifikasi.' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Gagal memverifikasi OTP.' });
  }
});

/**
 * POST /api/register
 * Registers a new user or updates their facial profile if NIM exists
 */
app.post('/api/register', async (req, res) => {
  const { nim, descriptor } = req.body;

  if (!nim || !descriptor) {
    return res.status(400).json({ error: 'NIM dan descriptor wajib diisi.' });
  }

  try {
    const descriptorString = JSON.stringify(descriptor);
    
    // MENGGUNAKAN LOGIKA EKSPLISIT AGAR AMAN DI SEMUA VERSI MYSQL
    const [rows] = await db.query('SELECT face_descriptor FROM users WHERE nim = ?', [nim]);
    
    if (rows.length > 0) {
      // Pindahkan wajah lama ke descriptor2, lalu simpan wajah baru
      const oldDescriptor = rows[0].face_descriptor;
      await db.query(
        'UPDATE users SET face_descriptor2 = ?, face_descriptor = ? WHERE nim = ?',
        [oldDescriptor, descriptorString, nim]
      );
    } else {
      // Insert user baru jika belum ada
      await db.query(
        'INSERT INTO users (nim, face_descriptor) VALUES (?, ?)',
        [nim, descriptorString]
      );
    }
    
    res.json({ success: true, message: 'Registrasi berhasil disimpan di server.' });
  } catch (error) {
    console.error('Error saving user data:', error);
    res.status(500).json({ error: 'Gagal menyimpan data ke database server.' });
  }
});

/**
 * POST /api/attendance
 * Records attendance, uploads photo to Cloudinary, and optionally auto-updates face descriptor
 */
app.post('/api/attendance', async (req, res) => {
  const { nim, type, latitude, longitude, photo_base64, report, descriptor } = req.body;

  if (!nim || !type || latitude === undefined || longitude === undefined || !photo_base64) {
    return res.status(400).json({ error: 'Semua data wajib diisi.' });
  }

  try {
    let photo_url = null;
    try {
      photo_url = await uploadPhoto(photo_base64, `absenbpjs/${nim}`);
    } catch (uploadErr) {
      console.error('Cloudinary upload failed:', uploadErr.message);
      photo_url = null; 
    }

    // 1. Catat Presensi
    const query = `
      INSERT INTO attendance (nim, type, latitude, longitude, photo_url, report) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [nim, type, latitude, longitude, photo_url, report || null]);
    
    // 2. FITUR AUTO-UPDATE WAJAH (EKSPLISIT)
    if (descriptor && Array.isArray(descriptor) && descriptor.length > 0) {
      try {
        const descriptorString = JSON.stringify(descriptor);
        const [userRows] = await db.query('SELECT face_descriptor FROM users WHERE nim = ?', [nim]);
        
        if (userRows.length > 0) {
          const oldDesc = userRows[0].face_descriptor;
          await db.query(
            'UPDATE users SET face_descriptor2 = ?, face_descriptor = ? WHERE nim = ?',
            [oldDesc, descriptorString, nim]
          );
          console.log(`[AUTO-UPDATE] Model wajah NIM ${nim} berhasil diperbarui.`);
        }
      } catch (updateErr) {
        console.error(`[AUTO-UPDATE ERROR] Gagal memperbarui wajah NIM ${nim}:`, updateErr.message);
      }
    }

    res.json({ success: true, message: `Berhasil ${type}!`, photo_url });
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: 'Gagal merekam absensi ke database.' });
  }
});

/**
 * GET /api/attendance/today/:nim
 * Fetches attendance history for a specific NIM for the current day
 */
app.get('/api/attendance/today/:nim', async (req, res) => {
  const { nim } = req.params;

  try {
    // 🚀 PERBAIKAN ZONA WAKTU: Tambahkan +7 Jam (WIB) pada timestamp dan waktu saat ini (UTC)
    const query = `
      SELECT id, type, 
             DATE_FORMAT(DATE_ADD(timestamp, INTERVAL 7 HOUR), '%Y-%m-%dT%H:%i:%s+07:00') AS timestamp, 
             latitude, longitude, photo_url, report 
      FROM attendance 
      WHERE nim = ? 
      AND DATE(DATE_ADD(timestamp, INTERVAL 7 HOUR)) = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR))
      ORDER BY timestamp ASC
    `;
    
    const [rows] = await db.query(query, [nim]);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    res.status(500).json({ error: 'Gagal mengambil riwayat absensi hari ini.' });
  }
});

/**
 * GET /api/get_zoom_status
 * Mengambil status fitur Zoom
 */
app.get('/api/get_zoom_status', async (req, res) => {
  try {
    const [rows] = await db.query("SELECT nilai FROM pengaturan_sistem WHERE nama_pengaturan = 'zoom_enabled'");
    let isEnabled = true; // default ON
    
    if (rows.length > 0) {
      isEnabled = rows[0].nilai === 'true';
    }
    
    res.json({ status: "success", is_enabled: isEnabled });
  } catch (error) {
    console.error('Error fetching zoom status:', error);
    res.json({ status: "error", message: error.message, is_enabled: true });
  }
});

/**
 * POST /api/update_zoom_status
 * Mengubah status fitur Zoom (Untuk Admin/Mentor)
 */
app.post('/api/update_zoom_status', async (req, res) => {
  const { is_enabled } = req.body;
  
  if (typeof is_enabled === 'undefined') {
    return res.status(400).json({ status: "error", message: "Data tidak lengkap" });
  }

  const statusStr = is_enabled ? 'true' : 'false';

  try {
    await db.query(
      `INSERT INTO pengaturan_sistem (nama_pengaturan, nilai) 
       VALUES ('zoom_enabled', ?) 
       ON DUPLICATE KEY UPDATE nilai = ?`,
      [statusStr, statusStr]
    );
    res.json({ status: "success" });
  } catch (error) {
    console.error('Error updating zoom status:', error);
    res.status(500).json({ status: "error", message: "Gagal menyimpan ke database TiDB: " + error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

module.exports = app;
