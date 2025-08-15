import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
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

  async exchangeCodeForTokens(code) {
    try {
      // Exchange authorization code for tokens
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'https://aether-server-j5kh.onrender.com/auth/google/callback'
      });

      const { id_token, access_token } = response.data;
      
      if (!id_token) {
        throw new Error('No ID token received from Google');
      }

      // Verify the ID token
      return await this.verifyToken(id_token);
    } catch (error) {
      log.error('Google code exchange failed', error);
      return {
        success: false,
        error: 'Token exchange failed'
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