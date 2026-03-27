/**
 * API Service connecting to the Express & MySQL Backend.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://absensai.vercel.app/api';

export const MockApi = {
  /**
   * Registers a new user into the database
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
   * Retrieves all registered user profiles to perform 1:N face matching
   */
  getAllUsers: async () => {
    try {
      // 🚀 VERSI ANTI-CORS: Cukup pakai ?t=... saja tanpa header Cache-Control!
      const response = await fetch(`${API_URL}/users?t=${new Date().getTime()}`);
      
      if (!response.ok) throw new Error('Gagal mengambil data dari server');
      return await response.json();
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal mengambil data dari server.');
    }
  },

  /**
   * Saves a check-in or check-out attendance record
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
   * Gets today's attendance history for a specific NIM
   */
  getTodayAttendance: async (nim) => {
    try {
      // 🚀 VERSI ANTI-CORS: Cukup pakai ?t=... saja
      const response = await fetch(`${API_URL}/attendance/today/${nim}?t=${new Date().getTime()}`);
      
      if (!response.ok) throw new Error('Gagal mengambil data riwayat dari server');
      return await response.json();
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal mengambil riwayat absensi dari server.');
    }
  }
};