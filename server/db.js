const mysql = require('mysql2/promise');
require('dotenv').config();

// Default configuration for local development
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'absenbpjs_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Enable SSL for cloud databases like TiDB or Aiven
if (process.env.DB_SSL === 'true') {
  dbConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  };
}

console.log('Connecting to MySQL with config:', {
  host: dbConfig.host,
  user: dbConfig.user,
  database: dbConfig.database,
});

const pool = mysql.createPool(dbConfig);

// Initialize the database table if it doesn't exist
async function initDB() {
  try {
    const connection = await pool.getConnection();
    
    // Create users table for storing biometrics
    // face_descriptor uses MEDIUMTEXT because the float array string is quite long
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nim VARCHAR(50) NOT NULL UNIQUE,
        face_descriptor MEDIUMTEXT NOT NULL,
        face_descriptor2 MEDIUMTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create attendance table for recording check-ins, check-outs, and photos
    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nim VARCHAR(50) NOT NULL,
        type ENUM('in', 'out', 'meet-in', 'meet-out') NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        photo_url LONGTEXT,
        photo_base64 LONGTEXT,
        report TEXT,
        FOREIGN KEY (nim) REFERENCES users(nim) ON DELETE CASCADE
      )
    `);

    // Alter existing tables safely to modify enums
    try {
       await connection.query(`
         ALTER TABLE attendance MODIFY COLUMN type ENUM('in', 'out', 'meet-in', 'meet-out') NOT NULL;
       `);
    } catch(alterErr) {
       console.log("Note: Could not alter attendance enum.");
    }

    // Migrate: add photo_url if table already exists without it
    try {
       await connection.query(`ALTER TABLE attendance ADD COLUMN photo_url LONGTEXT AFTER longitude`);
    } catch(alterErr) {}

    // Migrate: add face_descriptor2 column if it doesn't exist
    try {
       await connection.query(`ALTER TABLE users ADD COLUMN face_descriptor2 MEDIUMTEXT AFTER face_descriptor`);
       console.log('✅ Migration: Added face_descriptor2 column.');
    } catch(alterErr) {}

    // Migrate: add report column if it doesn't exist
    try {
       await connection.query(`ALTER TABLE attendance ADD COLUMN report TEXT AFTER photo_url`);
       console.log('✅ Migration: Added report column.');
    } catch(alterErr) {
       // Kolom mungkin sudah ada, tidak masalah
    }

    console.log('✅ Database initialized: users and attendance tables are ready.');
    connection.release();
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('❌ Error: Database does not exist.');
      console.error('Please create the database using the following command in your MySQL terminal/phpMyAdmin:');
      console.error(`CREATE DATABASE ${dbConfig.database};`);
    } else {
      console.error('❌ Error initializing database:', err);
    }
  }
}

initDB();

module.exports = pool;

//komit 