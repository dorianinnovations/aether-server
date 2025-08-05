import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import logger from '../utils/logger.js';

class FileProcessingService {
  constructor() {
    this.supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    this.supportedDocumentTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    this.supportedCodeTypes = [
      'text/javascript', 'application/javascript', 'text/x-python', 
      'application/json', 'text/html', 'text/css'
    ];
  }

  /**
   * Process uploaded files for GPT-4o vision
   * @param {Array} files - Array of uploaded files
   * @returns {Array} Processed files ready for AI consumption
   */
  async processFiles(files) {
    if (!files || files.length === 0) {
      return [];
    }

    const processedFiles = [];

    for (const file of files) {
      try {
        const processedFile = await this.processIndividualFile(file);
        if (processedFile) {
          processedFiles.push(processedFile);
        }
      } catch (error) {
        logger.error('Error processing individual file', {
          fileName: file.originalname,
          error: error.message
        });
        
        // Continue processing other files even if one fails
        processedFiles.push({
          originalName: file.originalname,
          type: 'error',
          error: error.message,
          processed: false
        });
      }
    }

    return processedFiles;
  }

  /**
   * Process a single file based on its type
   * @param {Object} file - Single uploaded file
   * @returns {Object} Processed file object
   */
  async processIndividualFile(file) {
    try {
      // Detect actual file type from buffer
      const detectedType = await fileTypeFromBuffer(file.buffer);
      const actualMimeType = detectedType?.mime || file.mimetype;

      logger.info('Processing file', {
        originalName: file.originalname,
        detectedType: actualMimeType,
        reportedType: file.mimetype,
        size: file.size
      });

      const baseFileInfo = {
        originalName: file.originalname,
        size: file.size,
        mimeType: actualMimeType,
        uploadedAt: new Date(),
        processed: true
      };

      // Process based on file type
      if (this.supportedImageTypes.includes(actualMimeType)) {
        return await this.processImage(file, baseFileInfo);
      } else if (this.supportedDocumentTypes.includes(actualMimeType)) {
        return await this.processDocument(file, baseFileInfo);
      } else if (this.supportedCodeTypes.includes(actualMimeType) || this.isCodeFile(file.originalname)) {
        return await this.processCodeFile(file, baseFileInfo);
      } else {
        // Handle as text file if possible
        return await this.processTextFile(file, baseFileInfo);
      }

    } catch (error) {
      logger.error('Error in processIndividualFile', {
        fileName: file.originalname,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Process image files for GPT-4o vision
   * @param {Object} file - Image file
   * @param {Object} baseInfo - Base file information
   * @returns {Object} Processed image data
   */
  async processImage(file, baseInfo) {
    try {
      // Get image metadata
      const metadata = await sharp(file.buffer).metadata();
      
      // Optimize image for GPT-4o (max 2048x2048, reduce file size if needed)
      let processedBuffer = file.buffer;
      let wasOptimized = false;

      // Resize if too large
      if (metadata.width > 2048 || metadata.height > 2048) {
        processedBuffer = await sharp(file.buffer)
          .resize(2048, 2048, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        wasOptimized = true;
      }

      // Convert to base64 for GPT-4o
      const base64Data = processedBuffer.toString('base64');
      const dataUrl = `data:${baseInfo.mimeType};base64,${base64Data}`;

      return {
        ...baseInfo,
        type: 'image',
        data: dataUrl,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          optimized: wasOptimized,
          originalSize: file.size,
          processedSize: processedBuffer.length
        }
      };

    } catch (error) {
      logger.error('Error processing image', {
        fileName: file.originalname,
        error: error.message
      });
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Process document files (PDF, TXT, MD)
   * @param {Object} file - Document file
   * @param {Object} baseInfo - Base file information
   * @returns {Object} Processed document data
   */
  async processDocument(file, baseInfo) {
    try {
      if (baseInfo.mimeType === 'application/pdf') {
        // For PDF files, we'll pass the raw data to GPT-4o
        // GPT-4o can handle PDF files directly
        const base64Data = file.buffer.toString('base64');
        const dataUrl = `data:application/pdf;base64,${base64Data}`;

        return {
          ...baseInfo,
          type: 'document',
          format: 'pdf',
          data: dataUrl,
          metadata: {
            pages: 'unknown', // Would need PDF parser to determine
            originalSize: file.size
          }
        };
      } else {
        // Handle text-based documents
        const textContent = file.buffer.toString('utf-8');
        
        // Truncate if too long (GPT-4o has token limits)
        const maxLength = 50000; // ~50k characters
        const truncatedContent = textContent.length > maxLength 
          ? textContent.substring(0, maxLength) + '\n... [Content truncated]'
          : textContent;

        return {
          ...baseInfo,
          type: 'document',
          format: 'text',
          data: truncatedContent,
          metadata: {
            originalLength: textContent.length,
            truncated: textContent.length > maxLength,
            encoding: 'utf-8'
          }
        };
      }

    } catch (error) {
      logger.error('Error processing document', {
        fileName: file.originalname,
        error: error.message
      });
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  /**
   * Process code files
   * @param {Object} file - Code file
   * @param {Object} baseInfo - Base file information
   * @returns {Object} Processed code data
   */
  async processCodeFile(file, baseInfo) {
    try {
      const codeContent = file.buffer.toString('utf-8');
      const fileExtension = this.getFileExtension(file.originalname);
      const language = this.detectLanguage(fileExtension, baseInfo.mimeType);

      // Truncate if too long
      const maxLength = 50000;
      const truncatedContent = codeContent.length > maxLength
        ? codeContent.substring(0, maxLength) + '\n// ... [Code truncated]'
        : codeContent;

      return {
        ...baseInfo,
        type: 'code',
        language,
        data: truncatedContent,
        metadata: {
          extension: fileExtension,
          originalLength: codeContent.length,
          truncated: codeContent.length > maxLength,
          linesOfCode: codeContent.split('\n').length
        }
      };

    } catch (error) {
      logger.error('Error processing code file', {
        fileName: file.originalname,
        error: error.message
      });
      throw new Error(`Code processing failed: ${error.message}`);
    }
  }

  /**
   * Process generic text files
   * @param {Object} file - Text file
   * @param {Object} baseInfo - Base file information
   * @returns {Object} Processed text data
   */
  async processTextFile(file, baseInfo) {
    try {
      const textContent = file.buffer.toString('utf-8');
      
      const maxLength = 50000;
      const truncatedContent = textContent.length > maxLength
        ? textContent.substring(0, maxLength) + '\n... [Content truncated]'
        : textContent;

      return {
        ...baseInfo,
        type: 'text',
        data: truncatedContent,
        metadata: {
          originalLength: textContent.length,
          truncated: textContent.length > maxLength,
          encoding: 'utf-8'
        }
      };

    } catch (error) {
      logger.error('Error processing text file', {
        fileName: file.originalname,
        error: error.message
      });
      throw new Error(`Text processing failed: ${error.message}`);
    }
  }

  /**
   * Check if file is a code file based on extension
   * @param {string} filename - File name
   * @returns {boolean} True if it's a code file
   */
  isCodeFile(filename) {
    const codeExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj',
      '.html', '.css', '.scss', '.less', '.xml', '.json', '.yaml', '.yml',
      '.sql', '.sh', '.bash', '.ps1', '.dockerfile', '.makefile'
    ];

    const extension = this.getFileExtension(filename).toLowerCase();
    return codeExtensions.includes(extension);
  }

  /**
   * Get file extension
   * @param {string} filename - File name
   * @returns {string} File extension
   */
  getFileExtension(filename) {
    return filename.substring(filename.lastIndexOf('.'));
  }

  /**
   * Detect programming language from extension and mime type
   * @param {string} extension - File extension
   * @param {string} mimeType - MIME type
   * @returns {string} Detected language
   */
  detectLanguage(extension, mimeType) {
    const languageMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.sql': 'sql',
      '.sh': 'bash',
      '.bash': 'bash'
    };

    return languageMap[extension.toLowerCase()] || 'text';
  }

  /**
   * Generate summary of processed files for logging
   * @param {Array} processedFiles - Array of processed files
   * @returns {Object} Summary statistics
   */
  generateProcessingSummary(processedFiles) {
    const summary = {
      totalFiles: processedFiles.length,
      successful: 0,
      failed: 0,
      types: {},
      totalSize: 0
    };

    processedFiles.forEach(file => {
      if (file.processed && file.type !== 'error') {
        summary.successful++;
        summary.types[file.type] = (summary.types[file.type] || 0) + 1;
        summary.totalSize += file.size;
      } else {
        summary.failed++;
      }
    });

    return summary;
  }
}

export default new FileProcessingService();