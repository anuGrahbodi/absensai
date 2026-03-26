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

// OTP Store: Map NIM -> { otp: string, expiresAt: number }
const otpStore = new Map();

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
 * Retrieves all registered users and their face descriptors
 */
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT nim, face_descriptor, face_descriptor2 FROM users');
    
    // Parse the JSON string back into an array for the frontend
    const users = rows.map(row => ({
      nim: row.nim,
      descriptor: JSON.parse(row.face_descriptor),
      descriptor2: row.face_descriptor2 ? JSON.parse(row.face_descriptor2) : null
    }));
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Gagal mengambil data pengguna dari database.' });
  }
});

/**
 * POST /api/request-otp
 * Generates an OTP, stores it with expiration, and sends via email
 */
app.post('/api/request-otp', async (req, res) => {
  const { nim } = req.body;
  if (!nim) return res.status(400).json({ error: 'NIM wajib diisi.' });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

  otpStore.set(nim, { otp, expiresAt });

  console.log(`[OTP GENERATED] NIM: ${nim}, OTP: ${otp}`);

  // Try to send email (if configured)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await transporter.sendMail({
        from: '"Absensi AI" <no-reply@absensiai.com>',
        to: 'sibaranianugrah@gmail.com',
        subject: `Permintaan OTP Registrasi Wajah - NIM: ${nim}`,
        html: `
          <h3>Permintaan OTP Registrasi Ulang Wajah</h3>
          <p>Seseorang dengan NIM <b>${nim}</b> sedang mencoba meregistrasi ulang wajahnya.</p>
          <p>Berikan kode OTP berikut kepada pengguna jika diverifikasi:</p>
          <h2 style="color: #4f46e5; letter-spacing: 5px;">${otp}</h2>
          <p><i>Kode OTP ini akan kadaluwarsa dalam 5 menit.</i></p>
        `
      });
      console.log('OTP email sent to sibaranianugrah@gmail.com');
    } catch (err) {
      console.error('Failed to send OTP email:', err.message);
      // We don't block the frontend, just log it.
    }
  } else {
    console.log('SMTP not configured, skipping email delivery.');
  }

  res.json({ success: true, message: 'OTP berhasil di-generate dan dikirim ke Admin.' });
});

/**
 * POST /api/verify-otp
 * Validates the submitted OTP against the stored one
 */
app.post('/api/verify-otp', (req, res) => {
  const { nim, otp } = req.body;
  
  if (!nim || !otp) {
    return res.status(400).json({ error: 'NIM dan OTP wajib diisi.' });
  }

  const storedData = otpStore.get(nim);

  if (!storedData) {
    return res.status(400).json({ error: 'OTP belum diminta atau sudah dihapus. Silakan minta ulang OTP.' });
  }

  if (Date.now() > storedData.expiresAt) {
    otpStore.delete(nim);
    return res.status(400).json({ error: 'OTP sudah kadaluwarsa. Silakan minta ulang OTP.' });
  }

  if (storedData.otp !== otp) {
    return res.status(400).json({ error: 'Kode OTP tidak valid.' });
  }

  // OTP is correct
  otpStore.delete(nim);
  res.json({ success: true, message: 'OTP diverifikasi.' });
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
    // Convert descriptor array to a string to store in MySQL
    const descriptorString = JSON.stringify(descriptor);
    
    // INSERT ... ON DUPLICATE KEY UPDATE avoids the need to do separate checking
    // Update old descriptor to descriptor2 and new descriptor to descriptor
    const query = `
      INSERT INTO users (nim, face_descriptor) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE face_descriptor2 = face_descriptor, face_descriptor = VALUES(face_descriptor)
    `;
    
    await db.query(query, [nim, descriptorString]);
    
    res.json({ success: true, message: 'Registrasi berhasil disimpan di server.' });
  } catch (error) {
    console.error('Error saving user data:', error);
    res.status(500).json({ error: 'Gagal menyimpan data ke database server.' });
  }
});

/**
 * POST /api/attendance
 * Records a check-in or check-out event.
 * Photo is uploaded to Cloudinary; only the URL is stored in MySQL.
 */
app.post('/api/attendance', async (req, res) => {
  // 1. Tambahkan 'report' ke dalam destructuring
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

    // 2. Update query INSERT untuk memasukkan kolom report
    const query = `
      INSERT INTO attendance (nim, type, latitude, longitude, photo_url, report) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    // 3. Masukkan variabel report ke dalam parameter (bisa bernilai null jika check-in)
    await db.query(query, [nim, type, latitude, longitude, photo_url, report || null]);
    
    // 4. Jika ada descriptor (artinya berhasil face match untuk checkin), update ke db untuk auto-rotate
    if (descriptor) {
      const descriptorString = JSON.stringify(descriptor);
      const updateQuery = `
        UPDATE users 
        SET face_descriptor2 = face_descriptor, face_descriptor = ? 
        WHERE nim = ?
      `;
      await db.query(updateQuery, [descriptorString, nim]);
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
    // Tambahkan 'report' ke dalam SELECT query agar React bisa merender laporannya di riwayat
    const query = `
      SELECT id, type, timestamp, latitude, longitude, photo_url, report 
      FROM attendance 
      WHERE nim = ? AND DATE(timestamp) = CURDATE()
      ORDER BY timestamp ASC
    `;
    
    const [rows] = await db.query(query, [nim]);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    res.status(500).json({ error: 'Gagal mengambil riwayat absensi hari ini.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});