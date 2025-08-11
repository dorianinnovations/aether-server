import { fileTypeFromBuffer } from 'file-type';
import logger from '../utils/logger.js';

class FileValidationService {
  constructor() {
    // Comprehensive security rules
    this.securityRules = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxTotalSize: 500 * 1024 * 1024, // 500MB total
      maxFiles: 5,
      
      // Allowed MIME types
      allowedMimeTypes: new Set([
        // Images
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        // Documents  
        'application/pdf', 'text/plain', 'text/markdown',
        // Code files
        'text/javascript', 'application/javascript', 'text/x-python',
        'application/json', 'text/html', 'text/css', 'text/x-java-source',
        'text/x-c', 'text/x-c++src', 'application/xml', 'text/xml'
      ]),

      // File extensions whitelist
      allowedExtensions: new Set([
        '.jpg', '.jpeg', '.png', '.webp', '.gif',
        '.pdf', '.txt', '.md', '.json', '.html', '.css', '.xml',
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
        '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.yaml', '.yml', '.sql'
      ]),

      // Dangerous file signatures to block
      dangerousSignatures: [
        { signature: [0x4D, 0x5A], description: 'PE Executable' }, // MZ header
        { signature: [0x50, 0x4B, 0x03, 0x04], description: 'ZIP (potential executable)' },
        { signature: [0x7F, 0x45, 0x4C, 0x46], description: 'ELF executable' },
        { signature: [0xCA, 0xFE, 0xBA, 0xBE], description: 'Java class file (potential malware)' },
        { signature: [0xFE, 0xED, 0xFA, 0xCE], description: 'Mach-O executable' }
      ],

      // Content-based security checks
      dangerousPatterns: [
        /<script.*?>.*?<\/script>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /on\w+\s*=/gi, // Event handlers
        /eval\s*\(/gi,
        /document\.write/gi,
        /window\.location/gi
      ]
    };
  }

  /**
   * Validate array of uploaded files
   * @param {Array} files - Array of files to validate
   * @returns {Object} Validation result
   */
  async validateFiles(files) {
    try {
      if (!files || files.length === 0) {
        return { valid: true, files: [], warnings: [] };
      }

      const validationResult = {
        valid: true,
        files: [],
        errors: [],
        warnings: [],
        summary: {
          totalFiles: files.length,
          totalSize: 0,
          validFiles: 0,
          rejectedFiles: 0
        }
      };

      // Check file count limit
      if (files.length > this.securityRules.maxFiles) {
        validationResult.valid = false;
        validationResult.errors.push({
          type: 'FILE_COUNT_EXCEEDED',
          message: `Too many files. Maximum ${this.securityRules.maxFiles} files allowed.`,
          limit: this.securityRules.maxFiles,
          actual: files.length
        });
        return validationResult;
      }

      // Calculate total size
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      validationResult.summary.totalSize = totalSize;

      if (totalSize > this.securityRules.maxTotalSize) {
        validationResult.valid = false;
        validationResult.errors.push({
          type: 'TOTAL_SIZE_EXCEEDED',
          message: `Total file size too large. Maximum ${this.formatBytes(this.securityRules.maxTotalSize)} allowed.`,
          limit: this.securityRules.maxTotalSize,
          actual: totalSize
        });
        return validationResult;
      }

      // Validate each file individually
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileValidation = await this.validateIndividualFile(file, i);
        
        if (fileValidation.valid) {
          validationResult.files.push(fileValidation.file);
          validationResult.summary.validFiles++;
        } else {
          validationResult.valid = false;
          validationResult.errors.push(...fileValidation.errors);
          validationResult.summary.rejectedFiles++;
        }

        if (fileValidation.warnings.length > 0) {
          validationResult.warnings.push(...fileValidation.warnings);
        }
      }

      logger.info('File validation completed', {
        totalFiles: validationResult.summary.totalFiles,
        validFiles: validationResult.summary.validFiles,
        rejectedFiles: validationResult.summary.rejectedFiles,
        totalSize: this.formatBytes(validationResult.summary.totalSize)
      });

      return validationResult;

    } catch (error) {
      logger.error('Error in file validation', {
        error: error.message,
        stack: error.stack
      });

      return {
        valid: false,
        files: [],
        errors: [{
          type: 'VALIDATION_ERROR',
          message: 'Internal validation error occurred',
          details: error.message
        }],
        warnings: [],
        summary: { totalFiles: 0, totalSize: 0, validFiles: 0, rejectedFiles: 0 }
      };
    }
  }

  /**
   * Validate a single file
   * @param {Object} file - File to validate
   * @param {number} index - File index for error reporting
   * @returns {Object} Individual file validation result
   */
  async validateIndividualFile(file, index = 0) {
    const result = {
      valid: true,
      file: null,
      errors: [],
      warnings: []
    };

    try {
      // Basic file checks
      if (!file || !file.buffer || file.buffer.length === 0) {
        result.valid = false;
        result.errors.push({
          type: 'EMPTY_FILE',
          message: `File ${index + 1}: Empty or corrupted file`,
          fileName: file.originalname
        });
        return result;
      }

      // File size check
      if (file.size > this.securityRules.maxFileSize) {
        result.valid = false;
        result.errors.push({
          type: 'FILE_SIZE_EXCEEDED',
          message: `File "${file.originalname}": Size exceeds ${this.formatBytes(this.securityRules.maxFileSize)} limit`,
          fileName: file.originalname,
          size: file.size,
          limit: this.securityRules.maxFileSize
        });
        return result;
      }

      // Filename validation
      const fileNameValidation = this.validateFileName(file.originalname);
      if (!fileNameValidation.valid) {
        result.valid = false;
        result.errors.push({
          type: 'INVALID_FILENAME',
          message: `File "${file.originalname}": ${fileNameValidation.reason}`,
          fileName: file.originalname
        });
        return result;
      }

      // File extension check
      const extension = this.getFileExtension(file.originalname).toLowerCase();
      if (!this.securityRules.allowedExtensions.has(extension)) {
        result.valid = false;
        result.errors.push({
          type: 'UNSUPPORTED_EXTENSION',
          message: `File "${file.originalname}": Extension "${extension}" not allowed`,
          fileName: file.originalname,
          extension: extension
        });
        return result;
      }

      // Detect actual file type from content
      const detectedType = await fileTypeFromBuffer(file.buffer);
      const actualMimeType = detectedType?.mime || file.mimetype;

      // MIME type validation with extension fallback
      const isMimeAllowed = this.securityRules.allowedMimeTypes.has(actualMimeType);
      const isExtensionAllowed = this.securityRules.allowedExtensions.has(extension);
      
      // Allow if MIME type is explicitly allowed
      // OR if MIME is generic (octet-stream) but extension is allowed
      // OR if MIME starts with 'text/' and extension is allowed
      if (!isMimeAllowed && 
          !(actualMimeType === 'application/octet-stream' && isExtensionAllowed) &&
          !(actualMimeType.startsWith('text/') && isExtensionAllowed)) {
        result.valid = false;
        result.errors.push({
          type: 'UNSUPPORTED_MIME_TYPE',
          message: `File "${file.originalname}": MIME type "${actualMimeType}" not allowed`,
          fileName: file.originalname,
          mimeType: actualMimeType,
          extension: extension
        });
        return result;
      }

      // MIME type vs extension mismatch check
      if (detectedType && this.isMimeTypeMismatch(extension, actualMimeType)) {
        result.warnings.push({
          type: 'MIME_EXTENSION_MISMATCH',
          message: `File "${file.originalname}": Extension "${extension}" doesn't match detected type "${actualMimeType}"`,
          fileName: file.originalname,
          extension: extension,
          detectedType: actualMimeType
        });
      }

      // File signature security check
      const signatureCheck = this.checkFileSignature(file.buffer);
      if (!signatureCheck.safe) {
        result.valid = false;
        result.errors.push({
          type: 'DANGEROUS_FILE_SIGNATURE',
          message: `File "${file.originalname}": ${signatureCheck.reason}`,
          fileName: file.originalname,
          threat: signatureCheck.threat
        });
        return result;
      }

      // Content-based security check for text files
      if (this.isTextBasedFile(actualMimeType)) {
        const contentCheck = await this.checkFileContent(file.buffer, file.originalname);
        if (!contentCheck.safe) {
          if (contentCheck.severity === 'error') {
            result.valid = false;
            result.errors.push({
              type: 'DANGEROUS_CONTENT',
              message: `File "${file.originalname}": ${contentCheck.reason}`,
              fileName: file.originalname,
              patterns: contentCheck.patterns
            });
            return result;
          } else {
            result.warnings.push({
              type: 'SUSPICIOUS_CONTENT',
              message: `File "${file.originalname}": ${contentCheck.reason}`,
              fileName: file.originalname,
              patterns: contentCheck.patterns
            });
          }
        }
      }

      // File passed all validations
      result.file = {
        ...file,
        validatedAt: new Date(),
        actualMimeType: actualMimeType,
        detectedType: detectedType,
        securityChecked: true
      };

      logger.info('File validated successfully', {
        fileName: file.originalname,
        size: file.size,
        mimeType: actualMimeType,
        extension: extension
      });

    } catch (error) {
      logger.error('Error validating individual file', {
        fileName: file.originalname,
        error: error.message,
        stack: error.stack
      });

      result.valid = false;
      result.errors.push({
        type: 'VALIDATION_ERROR',
        message: `File "${file.originalname}": Validation error - ${error.message}`,
        fileName: file.originalname
      });
    }

    return result;
  }

  /**
   * Validate filename for security issues
   * @param {string} filename - Filename to validate
   * @returns {Object} Validation result
   */
  validateFileName(filename) {
    if (!filename || typeof filename !== 'string') {
      return { valid: false, reason: 'Missing or invalid filename' };
    }

    if (filename.length > 255) {
      return { valid: false, reason: 'Filename too long (max 255 characters)' };
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
      return { valid: false, reason: 'Filename contains dangerous characters' };
    }

    // Check for path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return { valid: false, reason: 'Filename contains path traversal patterns' };
    }

    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = filename.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      return { valid: false, reason: 'Filename is a reserved system name' };
    }

    return { valid: true };
  }

  /**
   * Check file signature for malicious content
   * @param {Buffer} buffer - File buffer
   * @returns {Object} Security check result
   */
  checkFileSignature(buffer) {
    if (!buffer || buffer.length < 4) {
      return { safe: true };
    }

    // Check against dangerous signatures
    for (const { signature, description } of this.securityRules.dangerousSignatures) {
      if (this.bufferStartsWith(buffer, signature)) {
        return {
          safe: false,
          reason: `Dangerous file type detected: ${description}`,
          threat: description
        };
      }
    }

    return { safe: true };
  }

  /**
   * Check file content for dangerous patterns
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Original filename
   * @returns {Object} Content security check result
   */
  async checkFileContent(buffer, filename) {
    try {
      const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000)); // Check first 10KB
      const foundPatterns = [];

      // Check for dangerous patterns
      for (const pattern of this.securityRules.dangerousPatterns) {
        if (pattern.test(content)) {
          foundPatterns.push(pattern.toString());
        }
      }

      if (foundPatterns.length > 0) {
        return {
          safe: false,
          severity: 'error',
          reason: 'File contains potentially dangerous script content',
          patterns: foundPatterns
        };
      }

      // Additional checks for specific file types
      if (filename.endsWith('.html') || filename.endsWith('.htm')) {
        if (content.includes('<script') || content.includes('javascript:')) {
          return {
            safe: false,
            severity: 'warning',
            reason: 'HTML file contains scripts',
            patterns: ['<script>', 'javascript:']
          };
        }
      }

      return { safe: true };

    } catch (error) {
      // If we can't read as text, assume it's binary and safe
      return { safe: true };
    }
  }

  /**
   * Helper method to check if buffer starts with signature
   * @param {Buffer} buffer - File buffer
   * @param {Array} signature - Byte signature to check
   * @returns {boolean} True if buffer starts with signature
   */
  bufferStartsWith(buffer, signature) {
    if (buffer.length < signature.length) return false;
    
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) return false;
    }
    
    return true;
  }

  /**
   * Check if file type is text-based
   * @param {string} mimeType - MIME type
   * @returns {boolean} True if text-based
   */
  isTextBasedFile(mimeType) {
    return mimeType.startsWith('text/') || 
           mimeType === 'application/json' || 
           mimeType === 'application/xml' ||
           mimeType === 'application/javascript';
  }

  /**
   * Check for MIME type and extension mismatch
   * @param {string} extension - File extension
   * @param {string} mimeType - Detected MIME type
   * @returns {boolean} True if there's a suspicious mismatch
   */
  isMimeTypeMismatch(extension, mimeType) {
    const commonMismatches = {
      '.jpg': ['image/jpeg', 'image/jpg'],
      '.jpeg': ['image/jpeg'],
      '.png': ['image/png'],
      '.gif': ['image/gif'],
      '.pdf': ['application/pdf'],
      '.txt': ['text/plain'],
      '.js': ['text/javascript', 'application/javascript'],
      '.json': ['application/json'],
      '.html': ['text/html'],
      '.css': ['text/css']
    };

    const expectedTypes = commonMismatches[extension];
    return expectedTypes && !expectedTypes.includes(mimeType);
  }

  /**
   * Get file extension from filename
   * @param {string} filename - Filename
   * @returns {string} File extension
   */
  getFileExtension(filename) {
    return filename.substring(filename.lastIndexOf('.'));
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default new FileValidationService();