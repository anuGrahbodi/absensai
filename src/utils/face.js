import * as faceapi from 'face-api.js';
import { MockApi } from './api';

/**
 * Loads the pre-trained face-api.js models from the public/models directory
 */
export const loadFaceModels = async () => {
  try {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return true;
  } catch (error) {
    console.error("Error loading face models:", error);
    throw new Error("Gagal memuat model pengenalan wajah.");
  }
};

/**
 * Extracts a facial descriptor and face angle from a video element
 * @param {HTMLVideoElement} videoElement
 * @returns {Promise<{ descriptor: Float32Array, angle: number }>}
 */
export const extractFaceDescriptorAndAngle = async (videoElement) => {
  const detection = await faceapi.detectSingleFace(videoElement)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error("Wajah tidak terdeteksi. Pastikan pencahayaan cukup dan wajah terlihat jelas.");
  }
  
  // Validasi wajah full layar kamera
  // Menghitung rasio box wajah dibandingkan dengan ukuran video penuh
  const box = detection.detection.box;
  const faceArea = box.width * box.height;
  const videoArea = videoElement.videoWidth * videoElement.videoHeight;
  
  if (videoArea > 0 && (faceArea / videoArea) < 0.10) {
    throw new Error("Mohon dekatkan wajah Anda agar memenuhi layar kamera dengan jelas.");
  }

  // Calculate face angle/yaw based on eye and nose landmarks
  const landmarks = detection.landmarks;
  const nose = landmarks.getNose()[0];
  const leftEye = landmarks.getLeftEye()[0];
  const rightEye = landmarks.getRightEye()[3];
  
  // Simple yaw estimation based on horizontal distances
  const leftDist = nose.x - leftEye.x;
  const rightDist = rightEye.x - nose.x;
  
  // Ratio > 1 means looking right, < 1 means looking left. ~1 means center.
  let yawRatio = leftDist / (rightDist || 1);
  
  return {
    descriptor: detection.descriptor,
    angle: yawRatio
  };
};


/**
 * Saves a face descriptor and NIM to Database
 * @param {Float32Array} descriptor 
 * @param {string} nim
 */
export const saveUserFaceToDB = async (descriptor, nim) => {
  // Convert Float32Array to standard Array so it can be stringified and sent over network
  const arrayDescriptor = Array.from(descriptor);
  const data = {
    descriptor: arrayDescriptor,
    nim: nim
  };
  
  // Call backend API
  await MockApi.registerUser(data);
};

/**
 * Gets ALL saved user profiles from Database
 * @returns {Promise<Array<{ descriptor: Float32Array, descriptor2: Float32Array | null, nim: string }>>}
 */
export const getAllUserProfilesFromDB = async () => {
  const users = await MockApi.getAllUsers();
  
  if (!users || users.length === 0) return [];

  // Convert raw array descriptor back to Float32Array
  return users.map(u => ({
    nim: u.nim || "Unknown",
    descriptor: u.descriptor ? new Float32Array(u.descriptor) : null,
    descriptor2: u.descriptor2 ? new Float32Array(u.descriptor2) : null
  }));
};

/**
 * Old 1:1 match logic. Kept for backwards compatibility if needed.
 * @param {Float32Array} detectedDescriptor 
 * @param {Float32Array} savedDescriptor 
 * @returns {{isMatch: boolean, distance: number}}
 */
export const matchFace = (detectedDescriptor, savedDescriptor) => {
  const distance = faceapi.euclideanDistance(detectedDescriptor, savedDescriptor);
  return {
    isMatch: distance < 0.5, // strict threshold
    distance
  };
}


/**
 * 1:N match logic. Scans all profiles and returns the best match.
 * SUDAH DILENGKAPI PROTEKSI 128-DIMENSI & ANTI-KEBOBOLAN & CONTINUOUS LEARNING (2 WAJAH)
 * @param {Float32Array} detectedDescriptor 
 * @param {Array<{descriptor: Array, descriptor2: Array, nim: string}>} allProfiles 
 * @returns {{isMatch: boolean, nim: string, distance: number}}
 */
export const matchFace1toN = (detectedDescriptor, allProfiles) => {
  if (!allProfiles || allProfiles.length === 0) {
    return { isMatch: false, nim: null, distance: 1.0 };
  }

  let bestMatch = null;
  let minDistance = Number.MAX_VALUE;

  // 1. VALIDASI WAJAH KAMERA: Wajib memiliki tepat 128 titik biometrik
  const detectedArr = Object.values(detectedDescriptor);
  if (detectedArr.length !== 128) {
    return { isMatch: false, nim: null, distance: 1.0 }; // Tolak jika wajah di kamera tidak terbaca sempurna
  }
  const detected = new Float32Array(detectedArr);

  for (const profile of allProfiles) {
    try {
      let dist1 = Number.MAX_VALUE;
      let dist2 = Number.MAX_VALUE;

      // 2. CEK WAJAH 1 (Terbaru): Hanya proses jika datanya utuh 128 titik
      if (profile.descriptor) {
        const desc1Arr = Object.values(profile.descriptor);
        if (desc1Arr.length === 128) {
          const desc1 = new Float32Array(desc1Arr);
          dist1 = faceapi.euclideanDistance(detected, desc1);
        }
      }

      // 3. CEK WAJAH 2 (Cadangan): Hanya proses jika datanya utuh 128 titik
      if (profile.descriptor2) {
        const desc2Arr = Object.values(profile.descriptor2);
        if (desc2Arr.length === 128) {
          const desc2 = new Float32Array(desc2Arr);
          dist2 = faceapi.euclideanDistance(detected, desc2);
        }
      }

      // 4. PROTEKSI ANTI-BUG: Cegah sistem menganggap jarak '0' (akibat array kosong) sebagai kecocokan 100%
      if (dist1 === 0) dist1 = Number.MAX_VALUE;
      if (dist2 === 0) dist2 = Number.MAX_VALUE;

      // Ambil skor kemiripan terbaik dari Wajah 1 atau Wajah 2
      const distance = Math.min(dist1, dist2);

      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = profile;
      }
    } catch (err) {
      console.error("Gagal membaca struktur array biometrik:", err);
    }
  }

  // 5. AMBANG BATAS DIKEMBALIKAN KE SANGAT KETAT (0.50)
  // Orang asing biasanya mendapat skor di atas 0.60
  if (minDistance > 0.0 && minDistance <= 0.50) {
    return { isMatch: true, nim: bestMatch.nim, distance: minDistance };
  }

  return { isMatch: false, nim: null, distance: minDistance };
}