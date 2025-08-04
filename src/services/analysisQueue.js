/**
 * Analysis Queue Service
 * Simple in-memory queue for message analysis with configurable batch processing
 */

import cron from 'node-cron';
import Message from '../models/Message.js';
import profileAnalyzer from './profileAnalyzer.js';
import { log } from '../utils/logger.js';

class AnalysisQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.batchSize = 50;
    this.processInterval = '*/2 * * * *'; // Every 2 minutes (configurable)
    this.lastProcessedId = null;
    
    this.startProcessor();
  }

  /**
   * Add message to analysis queue
   */
  addToQueue(userId, messageId, content) {
    this.queue.push({
      userId,
      messageId,
      content,
      timestamp: new Date()
    });
    
    log.debug(`Message queued for analysis: ${messageId}`);
  }

  /**
   * Start the batch processor
   */
  startProcessor() {
    log.debug(`Starting analysis queue processor with interval: ${this.processInterval}`);
    
    cron.schedule(this.processInterval, async () => {
      await this.processBatch();
    });
  }

  /**
   * Process a batch of queued messages
   */
  async processBatch() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // Get batch from queue
      const batch = this.queue.splice(0, Math.min(this.batchSize, this.queue.length));
      
      log.debug(`Processing analysis batch: ${batch.length} messages`);
      
      // Process each message
      const promises = batch.map(item => 
        profileAnalyzer.analyzeMessage(item.userId, item.content)
      );
      
      await Promise.allSettled(promises);
      
      log.debug(`Completed analysis batch: ${batch.length} messages processed`);
      
    } catch (error) {
      log.error('Batch processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process unanalyzed messages from database (for backfill)
   */
  async processUnanalyzedMessages() {
    try {
      // Find messages that haven't been analyzed yet
      const query = this.lastProcessedId 
        ? { _id: { $gt: this.lastProcessedId }, type: 'user' }
        : { type: 'user' };
        
      const unanalyzedMessages = await Message.find(query)
        .limit(this.batchSize)
        .sort({ createdAt: 1 });

      if (unanalyzedMessages.length === 0) {
        return;
      }

      log.debug(`Processing ${unanalyzedMessages.length} unanalyzed messages from database`);

      // Add to queue for processing
      for (const msg of unanalyzedMessages) {
        this.addToQueue(msg.user, msg._id, msg.content);
      }

      // Update last processed ID
      this.lastProcessedId = unanalyzedMessages[unanalyzedMessages.length - 1]._id;
      
    } catch (error) {
      log.error('Failed to process unanalyzed messages:', error);
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      batchSize: this.batchSize,
      processInterval: this.processInterval,
      lastProcessedId: this.lastProcessedId
    };
  }

  /**
   * Update processing interval (for testing/scaling)
   */
  updateInterval(newInterval) {
    this.processInterval = newInterval;
    log.debug(`Analysis queue interval updated to: ${newInterval}`);
    // Note: Would need to restart the cron job to apply new interval
  }

  /**
   * Force process current queue (for testing)
   */
  async forceProcess() {
    log.debug('Force processing analysis queue...');
    await this.processBatch();
  }
}

export default new AnalysisQueue();