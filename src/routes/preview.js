import express from 'express';
import { protect } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

const router = express.Router();

router.post('/preview-image', protect, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Validate URL
    try {
      new globalThis.URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL provided' });
    }
    
    const encodedUrl = encodeURIComponent(url);
    const URLBOX_API_KEY = process.env.URLBOX_API_KEY || 'ubx_sk_CLjtkHeY3FPVcMxkHivscXaurkYmqLR7';
    const previewUrl = `https://api.urlbox.io/v1/${URLBOX_API_KEY}/png?url=${encodedUrl}&width=300&height=200&retina=false&delay=1000&wait_for=networkidle0`;
    
    log.api(`📸 Preview image requested for: ${url}`);
    
    res.json({ 
      success: true,
      previewUrl,
      originalUrl: url 
    });
    
  } catch (error) {
    log.error('❌ Preview image error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate preview image' 
    });
  }
});

export default router;