/**
 * API Service connecting to the Express & MySQL Backend.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://absensai.vercel.app/api';
const LOCAL_API_URL = 'http://localhost:5000/api';
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

      if (!response.ok) {
        throw new Error(data.error || 'Gagal menyimpan ke server');
      }

      return data;
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal terhubung ke database server.');
    }
  },

  /**
   * Retrieves all registered user profiles to perform 1:N face matching
   * @returns {Promise<Array>} Array of user objects
   */
  getAllUsers: async () => {
    try {
      const response = await fetch(`${API_URL}/users`);
      
      if (!response.ok) {
        throw new Error('Gagal mengambil data dari server');
      }

      const users = await response.json();
      return users;
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal mengambil data dari server.');
    }
  },

  /**
   * Saves a check-in or check-out attendance record
   * @param {Object} attendanceData { nim, type, latitude, longitude, photo_base64 }
   * @returns {Promise<Object>} { success: true, message: "..." }
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

      if (!response.ok) {
        throw new Error(data.error || 'Gagal merekam absensi ke server');
      }

      return data;
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal terhubung ke database server.');
    }
  },

  /**
   * Gets today's attendance history for a specific NIM
   * @param {string} nim 
   * @returns {Promise<Array>} Array of attendance objects
   */
  getTodayAttendance: async (nim) => {
    try {
      const response = await fetch(`${API_URL}/attendance/today/${nim}`);
      
      if (!response.ok) {
        throw new Error('Gagal mengambil data riwayat dari server');
      }

      const history = await response.json();
      return history;
    } catch (e) {
      console.error('API Error:', e);
      throw new Error('Gagal mengambil riwayat absensi dari server.');
    }
  }
};