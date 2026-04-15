/**
 * API Service connecting to the Express & MySQL Backend.
 */


// Gunakan Environment Variable dari Vite. 
// Fallback 1: Production (Vercel), Fallback 2: Localhost.
const API_URL = import.meta.env.VITE_API_URL || 'https://absensai.vercel.app/api';
// const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const LOCAL_API_URL = 'http://localhost:5000/api';


// Ekspor konstanta agar bisa dipakai secara terpisah di komponen lain jika diperlukan
export { API_URL, LOCAL_API_URL };

export const MockApi = {
  /**
   * Registers a new user into the database
   * @param {Object} userData { nim: "123", descriptor: [0.1, 0.2, ...] }
   * @returns {Promise<Object>} { success: true, message: "..." }
   */
  registerUser: async (userData) => {
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menyimpan ke server');
      
      return data;
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal terhubung ke database server.');
    }
  },

  /**
   * Retrieves all registered user profiles to perform 1:N face matching.
   * 🚀 Menggunakan ?t=... dan cache: 'no-store' agar selalu dapat data terbaru (Bypass Cache Browser/Vercel).
   * @returns {Promise<Array>} Array of user objects
   */
  getAllUsers: async () => {
    try {
      const response = await fetch(`${API_URL}/users?t=${new Date().getTime()}`, { 
        cache: 'no-store' 
      });
      
      if (!response.ok) throw new Error('Gagal mengambil data dari server');
      
      return await response.json();
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal mengambil data dari server.');
    }
  },

  /**
   * Saves a check-in or check-out attendance record (and triggers face auto-update if descriptor is present)
   * @param {Object} attendanceData { nim, type, latitude, longitude, photo_base64, report, descriptor }
   * @returns {Promise<Object>} { success: true, message: "...", photo_url: "..." }
   */
  saveAttendance: async (attendanceData) => {
    try {
      const response = await fetch(`${API_URL}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(attendanceData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal merekam absensi ke server');
      
      return data;
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal terhubung ke database server.');
    }
  },

  /**
   * Mengambil JUMLAH TOTAL aktivitas absensi hari ini secara global (untuk statistik)
   * @returns {Promise<number>} Total attendance count
   */
  getGlobalTodayAttendance: async () => {
    try {
      const response = await fetch(`${API_URL}/attendance/today?t=${new Date().getTime()}`, { 
        cache: 'no-store' 
      });
      
      if (!response.ok) throw new Error('Gagal mengambil total presensi global');
      
      const data = await response.json();
      return data.total;
    } catch (e) {
      console.error('API Error:', e);
      return 0; // Kembalikan 0 agar UI (seperti Dashboard) tidak crash jika gagal
    }
  },
  
  /**
   * Gets today's attendance history for a specific NIM.
   * @param {string} nim 
   * @returns {Promise<Array>} Array of attendance objects for the given user
   */
  getTodayAttendance: async (nim) => {
    try {
      const response = await fetch(`${API_URL}/attendance/today/${nim}?t=${new Date().getTime()}`, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error('Gagal mengambil data riwayat dari server');
      
      return await response.json();
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal mengambil riwayat absensi dari server.');
    }
  }
};