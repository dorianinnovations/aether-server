/**
 * Analysis Queue Service
 * Handles asynchronous profile analysis without blocking chat responses
 */

import EventEmitter from 'events';
import { log } from '../utils/logger.js';
import profileAnalyzer from './profileAnalyzer.js';

class AnalysisQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.batchSize = 5;
    this.batchTimeout = 2000; // 2 seconds
    this.batchTimer = null;
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalErrors: 0,
      lastProcessedAt: null
    };

    // Start processing
    this.startProcessing();
    log.info('Analysis Queue initialized');
  }

  /**
   * Add a message for profile analysis
   * @param {string} userId - User ID
   * @param {string} messageContent - Message content to analyze
   * @param {Object} context - Additional context
   */
  enqueue(userId, messageContent, context = {}) {
    if (!userId || !messageContent) {
      log.warn('Invalid analysis job - missing userId or messageContent');
      return false;
    }

    const job = {
      id: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      messageContent,
      context,
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: 3
    };

    this.queue.push(job);
    this.stats.totalQueued++;

    log.debug(`📥 Analysis job queued: ${job.id}`, {
      userId,
      messageLength: messageContent.length,
      queueLength: this.queue.length
    });

    // Start batch timer if not already running
    if (!this.batchTimer && !this.processing) {
      this.scheduleBatchProcessing();
    }

    return job.id;
  }

  /**
   * Schedule batch processing
   */
  scheduleBatchProcessing() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.batchTimeout);
  }

  /**
   * Start continuous processing
   */
  startProcessing() {
    // Process immediately if queue has items
    if (this.queue.length > 0 && !this.processing) {
      this.processBatch();
    }

    // Set up periodic processing
    setInterval(() => {
      if (this.queue.length > 0 && !this.processing) {
        this.processBatch();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Process a batch of analysis jobs
   */
  async processBatch() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    
    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get batch of jobs
    const batchSize = Math.min(this.batchSize, this.queue.length);
    const batch = this.queue.splice(0, batchSize);

    log.info(`Processing analysis batch: ${batch.length} jobs`);

    const results = await Promise.allSettled(
      batch.map(job => this.processJob(job))
    );

    // Handle results
    let successCount = 0;
    let errorCount = 0;

    results.forEach((result, index) => {
      const job = batch[index];
      
      if (result.status === 'fulfilled') {
        successCount++;
        this.stats.totalProcessed++;
        
        // Emit success event for real-time notifications
        this.emit('analysisComplete', {
          jobId: job.id,
          userId: job.userId,
          success: true,
          updates: result.value
        });
        
        log.debug(`✅ Analysis job completed: ${job.id}`);
      } else {
        errorCount++;
        this.stats.totalErrors++;
        
        // Retry failed jobs (up to maxAttempts)
        job.attempts++;
        if (job.attempts < job.maxAttempts) {
          this.queue.push(job);
          log.warn(`🔄 Retrying analysis job: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
        } else {
          log.error(`❌ Analysis job failed permanently: ${job.id}`, result.reason);
          
          this.emit('analysisError', {
            jobId: job.id,
            userId: job.userId,
            error: result.reason?.message || 'Unknown error'
          });
        }
      }
    });

    this.stats.lastProcessedAt = new Date();
    this.processing = false;

    log.info(`Batch processing complete: ${successCount} success, ${errorCount} errors, ${this.queue.length} remaining`);

    // Schedule next batch if queue has items
    if (this.queue.length > 0) {
      this.scheduleBatchProcessing();
    }
  }

  /**
   * Process a single analysis job
   * @param {Object} job - Analysis job
   */
  async processJob(job) {
    try {
      // Use enhanced profile analyzer
      const updates = await profileAnalyzer.analyzeMessageEnhanced(
        job.userId, 
        job.messageContent, 
        job.context
      );

      return updates;
    } catch (error) {
      log.error(`Analysis job processing failed: ${job.id}`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueLength: this.queue.length,
      processing: this.processing,
      uptime: process.uptime()
    };
  }

  /**
   * Clear the queue (for testing/maintenance)
   */
  clear() {
    const clearedCount = this.queue.length;
    this.queue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    log.info(`Analysis queue cleared: ${clearedCount} jobs removed`);
    return clearedCount;
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      batchSize: this.batchSize,
      stats: this.getStats()
    };
  }
}

export default new AnalysisQueue();