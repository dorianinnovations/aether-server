import { OAuth2Client } from 'google-auth-library';
import { log } from '../utils/logger.js';

class GoogleAuthService {
  constructor() {
    this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async verifyToken(token) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      
      return {
        success: true,
        data: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          email_verified: payload.email_verified
        }
      };
    } catch (error) {
      log.error('Google token verification failed', error);
      return {
        success: false,
        error: 'Invalid Google token'
      };
    }
  }

  generateUsername(email, name) {
    // Try to generate a username from email or name
    let baseUsername = '';
    
    if (name) {
      // Remove spaces and special characters from name
      baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    } else if (email) {
      // Use part before @ in email
      baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    
    // Ensure minimum length
    if (baseUsername.length < 3) {
      baseUsername = `user${Date.now().toString().slice(-6)}`;
    }
    
    // Truncate if too long
    if (baseUsername.length > 25) {
      baseUsername = baseUsername.substring(0, 25);
    }
    
    return baseUsername;
  }
}

export default new GoogleAuthService();