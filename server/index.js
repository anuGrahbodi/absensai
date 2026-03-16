const express = require('express');
const cors = require('cors');
const db = require('./db');
const { uploadPhoto } = require('./cloudinary');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow frontend to communicate with backend
app.use(express.json({ limit: '10mb' })); // Increase limit for large JSON arrays (face descriptors)

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
    const [rows] = await db.query('SELECT nim, face_descriptor FROM users');
    
    // Parse the JSON string back into an array for the frontend
    const users = rows.map(row => ({
      nim: row.nim,
      descriptor: JSON.parse(row.face_descriptor)
    }));
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Gagal mengambil data pengguna dari database.' });
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
    // Convert descriptor array to a string to store in MySQL
    const descriptorString = JSON.stringify(descriptor);
    
    // INSERT ... ON DUPLICATE KEY UPDATE avoids the need to do separate checking
    const query = `
      INSERT INTO users (nim, face_descriptor) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE face_descriptor = VALUES(face_descriptor)
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
  const { nim, type, latitude, longitude, photo_base64 } = req.body;

  if (!nim || !type || latitude === undefined || longitude === undefined || !photo_base64) {
    return res.status(400).json({ error: 'Semua data (nim, type, latitude, longitude, photo_base64) wajib diisi.' });
  }

  try {
    // Upload photo to Cloudinary and get back a URL
    let photo_url = null;
    try {
      photo_url = await uploadPhoto(photo_base64, `absenbpjs/${nim}`);
    } catch (uploadErr) {
      console.error('Cloudinary upload failed:', uploadErr.message);
      // Fallback: don't block attendance if image upload fails
      photo_url = null;
    }

    const query = `
      INSERT INTO attendance (nim, type, latitude, longitude, photo_url) 
      VALUES (?, ?, ?, ?, ?)
    `;
    
    await db.query(query, [nim, type, latitude, longitude, photo_url]);
    
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
    // Get records created today
    const query = `
      SELECT id, type, timestamp, latitude, longitude, photo_url 
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
