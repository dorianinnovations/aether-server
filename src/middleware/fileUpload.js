import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HTTP_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.memoryStorage();

// File filter for security
const fileFilter = (req, file, cb) => {
  try {
    // Allowed file types for GPT-4o vision
    const allowedTypes = {
      // Images
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg', 
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      // Documents
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      // Code files
      'text/javascript': '.js',
      'application/javascript': '.js',
      'text/x-python': '.py',
      'application/json': '.json',
      'text/html': '.html',
      'text/css': '.css',
      'text/x-java-source': '.java',
      'text/x-c': '.c',
      'text/x-c++src': '.cpp'
    };

    // Allowed extensions for fallback when MIME detection fails
    const allowedExtensions = [
      '.jpg', '.jpeg', '.png', '.webp', '.gif',
      '.pdf', '.txt', '.md', '.doc', '.docx',
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.json', '.html', '.css', '.xml', '.yaml', '.yml', '.sql'
    ];

    const mimeType = file.mimetype.toLowerCase();
    const extension = path.extname(file.originalname).toLowerCase();
    
    // Check MIME type first
    if (allowedTypes[mimeType]) {
      logger.info(`File accepted by MIME: ${file.originalname} (${mimeType})`);
      cb(null, true);
    } 
    // Fallback to extension check for files with generic MIME types
    else if (mimeType === 'application/octet-stream' && allowedExtensions.includes(extension)) {
      logger.info(`File accepted by extension: ${file.originalname} (${extension}, detected as ${mimeType})`);
      cb(null, true);
    }
    // Additional fallback for text files that might be misdetected
    else if (mimeType.startsWith('text/') && allowedExtensions.includes(extension)) {
      logger.info(`File accepted as text: ${file.originalname} (${mimeType}, ${extension})`);
      cb(null, true);
    }
    else {
      logger.warn(`File rejected: ${file.originalname} (${mimeType}, ${extension}) - unsupported type`);
      cb(new Error(`Unsupported file type: ${mimeType}`), false);
    }
  } catch (error) {
    logger.error('Error in file filter', { error: error.message });
    cb(error, false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5, // Maximum 5 files per request
    fields: 10, // Maximum 10 non-file fields
    fieldNameSize: 100, // Maximum field name size
    fieldSize: 1024 * 1024, // Maximum field value size (1MB)
  }
});

// Error handling middleware for multer
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.warn('Multer error', {
      error: err.message,
      code: err.code,
      field: err.field
    });

    let message = 'File upload error';
    let status = HTTP_STATUS.BAD_REQUEST;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large. Maximum size is 10MB per file.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum 5 files allowed.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field. Use "files" field name.';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in request.';
        break;
      case 'LIMIT_FIELD_SIZE':
        message = 'Field value too large.';
        break;
      default:
        message = `Upload error: ${err.message}`;
    }

    return res.status(status).json({
      success: false,
      message,
      error: err.code
    });
  }

  if (err.message.includes('Unsupported file type')) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: err.message,
      supportedTypes: [
        'Images: JPEG, PNG, WebP, GIF',
        'Documents: PDF, TXT, MD, DOC, DOCX', 
        'Code: JS, PY, JSON, HTML, CSS, JAVA, C, CPP'
      ]
    });
  }

  next(err);
};

// File upload middleware
export const uploadFiles = upload.array('files', 5);

// Validate uploaded files after multer processing
export const validateUploadedFiles = (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next(); // No files to validate
    }

    const validatedFiles = [];

    for (const file of req.files) {
      // Additional validation
      if (!file.buffer || file.buffer.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: `Empty file: ${file.originalname}`
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
      
      validatedFiles.push({
        ...file,
        sanitizedName,
        uploadedAt: new Date()
      });

      logger.info('File validated', {
        originalName: file.originalname,
        sanitizedName,
        size: file.size,
        mimeType: file.mimetype
      });
    }

    req.validatedFiles = validatedFiles;
    next();

  } catch (error) {
    logger.error('Error validating uploaded files', {
      error: error.message,
      stack: error.stack
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error validating files'
    });
  }
};

export default {
  uploadFiles,
  handleMulterError,
  validateUploadedFiles
};