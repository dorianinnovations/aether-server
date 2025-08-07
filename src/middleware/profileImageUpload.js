import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HTTP_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/profiles');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for profile image uploads
const storage = multer.memoryStorage();

// File filter for profile images only
const profileImageFilter = (req, file, cb) => {
  try {
    // Only allow image types for profile photos/banners
    const allowedTypes = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg', 
      'image/png': '.png',
      'image/webp': '.webp'
    };

    const mimeType = file.mimetype.toLowerCase();
    
    if (allowedTypes[mimeType]) {
      logger.info(`Profile image accepted: ${file.originalname} (${mimeType})`);
      cb(null, true);
    } else {
      logger.warn(`Profile image rejected: ${file.originalname} (${mimeType}) - unsupported type`);
      cb(new Error(`Unsupported image type. Allowed: JPEG, PNG, WebP`), false);
    }
  } catch (error) {
    logger.error('Error in profile image filter', { error: error.message });
    cb(error, false);
  }
};

// Multer configuration for profile images (1MB limit)
const profileUpload = multer({
  storage: storage,
  fileFilter: profileImageFilter,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB per file
    files: 1, // Only 1 file per request for profile images
    fields: 5, // Limited non-file fields
    fieldNameSize: 100,
    fieldSize: 1024, // Small field value size
  }
});

// Error handling middleware for profile image uploads
export const handleProfileImageError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.warn('Profile image upload error', {
      error: err.message,
      code: err.code,
      field: err.field
    });

    let message = 'Profile image upload error';
    let status = HTTP_STATUS.BAD_REQUEST;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'Profile image too large. Maximum size is 1MB.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Only one profile image allowed per request.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field. Use "profileImage" or "bannerImage".';
        break;
      default:
        message = `Profile image upload error: ${err.message}`;
    }

    return res.status(status).json({
      success: false,
      message,
      error: err.code
    });
  }

  if (err.message.includes('Unsupported image type')) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: err.message,
      supportedTypes: ['JPEG', 'PNG', 'WebP']
    });
  }

  next(err);
};

// Profile photo upload middleware
export const uploadProfilePhoto = profileUpload.single('profilePhoto');

// Banner image upload middleware  
export const uploadBannerImage = profileUpload.single('bannerImage');

// Validate uploaded profile image
export const validateProfileImage = (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const file = req.file;

    // Check file buffer
    if (!file.buffer || file.buffer.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Empty image file'
      });
    }

    // Check file name
    if (!file.originalname || file.originalname.length > 255) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid file name'
      });
    }

    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-_]/g, '_');
    
    req.validatedImage = {
      ...file,
      sanitizedName,
      uploadedAt: new Date()
    };

    logger.info('Profile image validated', {
      originalName: file.originalname,
      sanitizedName,
      size: file.size,
      mimeType: file.mimetype
    });

    next();

  } catch (error) {
    logger.error('Error validating profile image', {
      error: error.message,
      stack: error.stack
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error validating profile image'
    });
  }
};

export default {
  uploadProfilePhoto,
  uploadBannerImage,
  handleProfileImageError,
  validateProfileImage
};