const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a base64 image string to Cloudinary.
 * Returns the secure URL of the uploaded image.
 */
async function uploadPhoto(base64Data, folder = 'absenbpjs') {
  // base64Data may be a full data URI like "data:image/jpeg;base64,..."
  const result = await cloudinary.uploader.upload(base64Data, {
    folder,
    resource_type: 'image',
  });
  return result.secure_url;
}

module.exports = { uploadPhoto };
