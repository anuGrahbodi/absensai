/**
 * Mock API Service simulating a dynamic Backend Database.
 * In a real application, this would make fetch() or axios calls to a Node/Python/PHP server.
 * Here, we use localStorage to simulate a database table 'bpjs_users'.
 */

// Initialize "database table" if empty
if (!localStorage.getItem('bpjs_users')) {
  localStorage.setItem('bpjs_users', JSON.stringify([]));
}

// Helper to simulate network latency
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const MockApi = {
  /**
   * Registers a new user into the database
   * @param {Object} userData { nim: "123", descriptor: [0.1, 0.2, ...] }
   * @returns {Promise<Object>} { success: true, message: "..." }
   */
  registerUser: async (userData) => {
    // Simulate network delay (800ms)
    await delay(800);

    try {
      const usersStr = localStorage.getItem('bpjs_users');
      const users = JSON.parse(usersStr) || [];

      // Check if NIM already exists
      const existingUserIdx = users.findIndex(u => u.nim === userData.nim);
      
      if (existingUserIdx >= 0) {
        // Update existing user's face profile
        users[existingUserIdx] = userData;
      } else {
        // Insert new user
        users.push(userData);
      }

      localStorage.setItem('bpjs_users', JSON.stringify(users));
      
      return { success: true, message: 'Registrasi berhasil disimpan di server.' };
    } catch (e) {
      throw new Error('Gagal terhubung ke database server.');
    }
  },

  /**
   * Retrieves all registered user profiles to perform 1:N face matching
   * @returns {Promise<Array>} Array of user objects
   */
  getAllUsers: async () => {
    // Simulate network delay (500ms)
    await delay(500);

    try {
      const usersStr = localStorage.getItem('bpjs_users');
      return JSON.parse(usersStr) || [];
    } catch (e) {
      throw new Error('Gagal mengambil data dari server.');
    }
  }
};
