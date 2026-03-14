import { getDistance } from 'geolib';

// Target coordinate
export const TARGET_COORDINATE = {
  latitude: 3.5756825,
  longitude: 98.6654552
};

export const MAX_RADIUS_METERS = 30;

/**
 * Gets the current user location using the HTML5 Geolocation API.
 * @returns {Promise<GeolocationCoordinates>}
 */
export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => {
        let errorMsg = "Gagal mendapatkan lokasi.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "Akses lokasi ditolak. Mohon izinkan akses lokasi di browser Anda.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Informasi lokasi tidak tersedia.";
            break;
          case error.TIMEOUT:
            errorMsg = "Waktu permintaan lokasi habis.";
            break;
        }
        reject(new Error(errorMsg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
};

/**
 * Validates if the given coordinates are within the acceptable radius from target.
 * @param {number} lat 
 * @param {number} lng 
 * @returns {{isValid: boolean, distance: number}}
 */
export const validateLocationDistance = (lat, lng) => {
  const distance = getDistance(
    { latitude: lat, longitude: lng },
    TARGET_COORDINATE
  );

  return {
    isValid: distance <= MAX_RADIUS_METERS,
    distance
  };
};
