import nodemailer from 'nodemailer';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * AETHER EMAIL SERVICE
 * Enhanced free email service with multiple providers and fallback support
 * 
 * Services Priority:
 * 1. Gmail SMTP (500 emails/day free) - PRIMARY
 * 2. Brevo/Sendinblue (300 emails/day free) - SECONDARY  
 * 3. SendGrid (100 emails/day free) - TERTIARY
 * 4. Ethereal (test only) - FALLBACK
 */
class EmailService {
  constructor() {
    this.primaryTransporter = null;
    this.fallbackTransporter = null;
    this.brevoApi = null;
    this.sendgridApi = null;
    this.isInitialized = false;
    this.emailStats = { 
      sent: 0, 
      failed: 0, 
      dailyCount: 0, 
      lastReset: new Date(),
      serviceUsage: { gmail: 0, brevo: 0, sendgrid: 0, ethereal: 0 }
    };
    this.initPromise = this.initializeEmailServices();
  }

  async initializeEmailServices() {
    try {
      // Initializing FREE email services
      
      // PRIMARY: Gmail SMTP (500 emails/day free)
      if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
        // Setting up Gmail SMTP as PRIMARY
        this.primaryTransporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 1000,
          rateLimit: 5
        });
        
        // Test Gmail connection
        await this.primaryTransporter.verify();
        console.log('✅ Gmail SMTP verified and ready');
      }
      
      // SECONDARY: Brevo (Sendinblue) API (300 emails/day free)
      if (process.env.BREVO_API_KEY) {
        // Setting up Brevo as SECONDARY
        this.brevoApi = {
          apiKey: process.env.BREVO_API_KEY,
          baseUrl: 'https://api.brevo.com/v3/smtp/email'
        };
        console.log('✅ Brevo API configured');
      }
      
      // TERTIARY: SendGrid API (100 emails/day free)
      if (process.env.SENDGRID_API_KEY) {
        // Setting up SendGrid as TERTIARY
        this.sendgridApi = {
          apiKey: process.env.SENDGRID_API_KEY,
          baseUrl: 'https://api.sendgrid.com/v3/mail/send'
        };
        console.log('✅ SendGrid API configured');
      }
      
      // Skip Ethereal for now - focus on Gmail testing
      
      this.isInitialized = true;
      console.log('🚀 Aether email services initialized successfully');
      this.logServiceStatus();
      
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
      this.isInitialized = false;
    }
  }
  
  logServiceStatus() {
    const services = [];
    if (this.primaryTransporter) services.push('Gmail SMTP');
    if (this.brevoApi) services.push('Brevo API');
    if (this.sendgridApi) services.push('SendGrid API');
    if (this.fallbackTransporter) services.push('Ethereal Test');
    
    console.log(`📧 Active email services: ${services.join(', ')}`);
  }
  
  resetDailyCountIfNeeded() {
    const now = new Date();
    const lastReset = this.emailStats.lastReset;
    
    // Reset daily count if it's a new day
    if (now.getDate() !== lastReset.getDate() || 
        now.getMonth() !== lastReset.getMonth() || 
        now.getFullYear() !== lastReset.getFullYear()) {
      this.emailStats.dailyCount = 0;
      this.emailStats.serviceUsage = { gmail: 0, brevo: 0, sendgrid: 0, ethereal: 0 };
      this.emailStats.lastReset = now;
      console.log('📅 Daily email count reset');
    }
  }

  async sendWelcomeEmail(userEmail, userName = 'User') {
    // Wait for initialization if needed
    if (!this.isInitialized) {
      await this.initPromise;
    }
    
    if (!this.isInitialized) {
      console.warn('Email service not initialized, skipping email');
      return { success: false, error: 'Email service not initialized' };
    }

    this.resetDailyCountIfNeeded();
    
    const emailData = {
      to: userEmail,
      subject: 'Welcome to Aether - Your AI Journey Begins! ✨',
      html: this.getWelcomeEmailTemplate(userName),
      text: this.getWelcomeEmailText(userName)
    };

    return await this.sendEmailWithFallback(emailData, 'welcome');
  }
  
  async sendEmailWithFallback(emailData, emailType = 'general') {
    const attempts = [];
    
    try {
      // ATTEMPT 1: Gmail SMTP (Primary - 500 emails/day)
      if (this.primaryTransporter && this.emailStats.serviceUsage.gmail < 450) { // Leave buffer
        try {
          const result = await this.sendViaGmail(emailData);
          this.emailStats.sent++;
          this.emailStats.dailyCount++;
          this.emailStats.serviceUsage.gmail++;
          console.log(`✅ Email sent via Gmail (${this.emailStats.serviceUsage.gmail}/450 today)`);
          return { ...result, service: 'gmail', attempt: 1 };
        } catch (error) {
          attempts.push({ service: 'gmail', error: error.message });
          console.warn('⚠️ Gmail failed, trying Brevo...', error.message);
        }
      }
      
      // ATTEMPT 2: Brevo API (Secondary - 300 emails/day)
      if (this.brevoApi && this.emailStats.serviceUsage.brevo < 250) { // Leave buffer
        try {
          const result = await this.sendViaBrevo(emailData);
          this.emailStats.sent++;
          this.emailStats.dailyCount++;
          this.emailStats.serviceUsage.brevo++;
          console.log(`✅ Email sent via Brevo (${this.emailStats.serviceUsage.brevo}/250 today)`);
          return { ...result, service: 'brevo', attempt: 2 };
        } catch (error) {
          attempts.push({ service: 'brevo', error: error.message });
          console.warn('⚠️ Brevo failed, trying SendGrid...', error.message);
        }
      }
      
      // ATTEMPT 3: SendGrid API (Tertiary - 100 emails/day)
      if (this.sendgridApi && this.emailStats.serviceUsage.sendgrid < 80) { // Leave buffer
        try {
          const result = await this.sendViaSendGrid(emailData);
          this.emailStats.sent++;
          this.emailStats.dailyCount++;
          this.emailStats.serviceUsage.sendgrid++;
          console.log(`✅ Email sent via SendGrid (${this.emailStats.serviceUsage.sendgrid}/80 today)`);
          return { ...result, service: 'sendgrid', attempt: 3 };
        } catch (error) {
          attempts.push({ service: 'sendgrid', error: error.message });
          console.warn('⚠️ SendGrid failed, using fallback...', error.message);
        }
      }
      
      // ATTEMPT 4: Ethereal test (Development fallback)
      if (this.fallbackTransporter) {
        try {
          const result = await this.sendViaFallback(emailData);
          this.emailStats.serviceUsage.ethereal++;
          console.log('✅ Email sent via test service (development)');
          return { ...result, service: 'ethereal-test', attempt: 4 };
        } catch (error) {
          attempts.push({ service: 'ethereal', error: error.message });
        }
      }
      
      // All services failed
      this.emailStats.failed++;
      console.error('❌ All email services failed:', attempts);
      return { 
        success: false, 
        error: 'All email services failed',
        attempts: attempts
      };
      
    } catch (error) {
      this.emailStats.failed++;
      console.error('❌ Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendNotificationEmail(toEmail, subject, message) {
    if (!this.isInitialized) {
      await this.initPromise;
    }
    
    if (!this.isInitialized) {
      console.warn('Email service not initialized, skipping email');
      return { success: false, error: 'Email service not initialized' };
    }

    const emailData = {
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 20px;">
          <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e5e5;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 24px; font-weight: bold; color: #000000; margin-bottom: 10px;">Aether</div>
              <div style="color: #666666; font-size: 16px;">Notification</div>
            </div>
            <div style="color: #333333; font-size: 16px; line-height: 1.6;">${message}</div>
            <hr style="border: none; height: 1px; background: #e5e5e5; margin: 30px 0;">
            <p style="color: #666666; font-size: 14px; text-align: center; margin: 0;">
              This is an automated message from Aether AI.
            </p>
          </div>
        </div>
      `,
      text: message
    };

    return await this.sendEmailWithFallback(emailData, 'notification');
  }
  
  async sendViaGmail(emailData) {
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'Aether Team <noreply@aether.app>',
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text
    };

    const info = await this.primaryTransporter.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(info) : null
    };
  }
  
  async sendViaBrevo(emailData) {
    const brevoPayload = {
      sender: {
        name: 'Aether Team',
        email: process.env.FROM_EMAIL || 'noreply@aether.app'
      },
      to: [{ email: emailData.to }],
      subject: emailData.subject,
      htmlContent: emailData.html,
      textContent: emailData.text
    };

    const response = await axios.post(this.brevoApi.baseUrl, brevoPayload, {
      headers: {
        'api-key': this.brevoApi.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      success: true,
      messageId: response.data.messageId || response.data.id,
      response: response.data
    };
  }
  
  async sendViaSendGrid(emailData) {
    const sendgridPayload = {
      personalizations: [{
        to: [{ email: emailData.to }],
        subject: emailData.subject
      }],
      from: {
        email: process.env.FROM_EMAIL || 'noreply@aether.app',
        name: 'Aether Team'
      },
      content: [
        {
          type: 'text/plain',
          value: emailData.text
        },
        {
          type: 'text/html',
          value: emailData.html
        }
      ]
    };

    const response = await axios.post(this.sendgridApi.baseUrl, sendgridPayload, {
      headers: {
        'Authorization': `Bearer ${this.sendgridApi.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      success: true,
      messageId: response.headers['x-message-id'] || 'sendgrid-success',
      response: response.status
    };
  }
  
  async sendViaFallback(emailData) {
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@aether.app',
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text
    };

    const info = await this.fallbackTransporter.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info)
    };
  }

  async sendPremiumWelcomeEmail(userEmail, userName, subscriptionDetails) {
    // Wait for initialization if needed
    if (!this.isInitialized) {
      await this.initPromise;
    }
    
    if (!this.isInitialized) {
      console.warn('Email service not initialized, skipping premium welcome email');
      return { success: false, error: 'Email service not initialized' };
    }

    this.resetDailyCountIfNeeded();
    
    const emailData = {
      to: userEmail,
      subject: '🚀 Welcome to Aether Premium - Unlock Your Full Potential!',
      html: this.getPremiumWelcomeEmailTemplate(userName, subscriptionDetails),
      text: this.getPremiumWelcomeEmailText(userName, subscriptionDetails)
    };

    return await this.sendEmailWithFallback(emailData, 'premium-welcome');
  }
  
  getEmailStats() {
    return {
      ...this.emailStats,
      services: {
        gmail: !!this.primaryTransporter,
        brevo: !!this.brevoApi,
        sendgrid: !!this.sendgridApi,
        fallback: !!this.fallbackTransporter
      },
      dailyLimits: {
        gmail: { used: this.emailStats.serviceUsage.gmail, limit: 450 },
        brevo: { used: this.emailStats.serviceUsage.brevo, limit: 250 },
        sendgrid: { used: this.emailStats.serviceUsage.sendgrid, limit: 80 }
      }
    };
  }

  getWelcomeEmailTemplate(userName) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Aether Email</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Mozilla+Headline:wght@400;600;700&family=Mozilla+Text:wght@400;500;600&display=swap" rel="stylesheet">
      </head>
      <body>
          <div style="width: 100%; max-width: 600px; margin: 0 auto; background: #0f0f0f; font-family: 'Mozilla Text', sans-serif; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.6); letter-spacing: -0.2px;">
            <div style="background: #1a1a1a; text-align: center; padding: 40px 30px; border-bottom: 1px solid #333; position: relative; border-radius: 12px 12px 0 0;">
              <img src="/assets/images/aether-logo-1.png" alt="AetheR" style="height: 50px; border-radius: 8px;" />
            </div>
            
            <div style="padding: 40px; border-radius: 10px;">
              <h1 style="font-size: 24px; font-weight: 600; color: #ffffff; margin: 30px 0 10px 0; font-family: 'Mozilla Headline', sans-serif; letter-spacing: -0.3px;">You're in. Welcome to AetheR.</h1>
              <p style="font-size: 16px; color: #b8b8b8; line-height: 1.6; margin-bottom: 30px; letter-spacing: -0.1px;">
                Seriously, thank you for being here. You're one of the very first to experience AetheR, and that means the world to us. We started this because we're obsessed with that feeling—the electric moment you discover a track that feels like it was made just for you. We think finding that feeling should be easier.
              </p>
              <p style="font-size: 16px; color: #b8b8b8; line-height: 1.6; margin-bottom: 30px; letter-spacing: -0.1px;">
                AetheR is our answer. It's a discovery platform built on a simple, powerful idea: a conversation. By chatting with our AI about what you love, the vibe you're chasing, and what hits you *just right*, you unlock a universe of music handpicked for your unique taste. No more dead-end algorithms. Just pure, personalized discovery.
              </p>
              
              <div style="margin-top: 40px;">
                <h2 style="font-size: 20px; font-weight: 600; color: #ffffff; margin-bottom: 20px; font-family: 'Mozilla Headline', sans-serif; letter-spacing: -0.3px;">What You Can Do Right Now</h2>
                
                <div style="margin-bottom: 20px;">
                  <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin: 0 0 8px 0; font-family: 'Mozilla Headline', sans-serif; letter-spacing: -0.2px;">Chat Your Way to a Perfect Playlist</h3>
                  <p style="font-size: 14px; color: #b8b8b8; margin: 0; line-height: 1.5; letter-spacing: -0.1px;">Forget endless scrolling. Tell AetheR about that one deep cut you love, the vibe you're chasing, or a song you just can't get out of your head. Our AI doesn't just match keywords; it understands the texture, energy, and emotion you're describing to connect you with tracks you'll actually love. It's less like a search engine, more like a conversation with a friend who has impeccable taste.</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                  <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin: 0 0 8px 0; font-family: 'Mozilla Headline', sans-serif; letter-spacing: -0.2px;">Craft Your Sonic Identity</h3>
                  <p style="font-size: 14px; color: #b8b8b8; margin: 0; line-height: 1.5; letter-spacing: -0.1px;">Your profile is your stage. Showcase your all-time favorite albums (your 'grails'), link your socials, and create a snapshot of your musical soul. AetheR is about connection, and your profile is your handshake. Make it yours.</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                  <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin: 0 0 8px 0; font-family: 'Mozilla Headline', sans-serif; letter-spacing: -0.2px;">Effortless Curation, Powered by AI</h3>
                  <p style="font-size: 14px; color: #b8b8b8; margin: 0; line-height: 1.5; letter-spacing: -0.1px;">This is where the magic happens. Every conversation you have refines your personal taste profile. AetheR learns, adapts, and anticipates, building playlists and suggesting artists with an uncanny understanding of what you want to hear next. The result? A listening experience that constantly evolves *with* you.</p>
                </div>
                
                <div style="text-align: right; margin-top: 30px;">
                  <a href="aether://open" style="background: #ffffff; color: #000000; padding: 16px 22px; text-decoration: none; font-weight: 600; font-size: 12px; display: inline-block; border-radius: 4px; letter-spacing: -0.2px; border: 1px solid #ffffff;">Jump In</a>
                </div>
              </div>
            </div>
            
            <div style="background: #0a0a0a; color: #888; text-align: center; padding: 30px; border-top: 1px solid #333; border-radius: 0 0 12px 12px;">
             
              <br>
              <p>Have a question? Hit reply. We're a small team and we read every single email.</p>
              <p style="margin: 8px 0; font-size: 14px; letter-spacing: -0.1px;">numinaworks@gmail.com</p>
              <p style="font-size: 12px; color: #666; margin-top: 20px; letter-spacing: -0.05px;">
                <a href="#" style="color: #666;">Unsubscribe from these emails</a>         </p>
                 <p style="margin: 8px 0; font-size: 8px; letter-spacing: -0.1px;">*Our AI discovery engine leverages cutting-edge models from leading developers. These models are subject to the limitations and availability of their respective providers.</p>
            </div>
          </div>
      </body>
      </html>
    `;
  }

  getWelcomeEmailText(userName) {
    return `
Welcome to Aether

You're now part of the Aether community. Experience AI conversations that understand you, track your insights, and help you discover amazing content.

What's waiting for you:
- Intelligent Conversations - Chat with AI that adapts to your style
- Personal Analytics - Discover patterns and enhance communication  
- Live Content Discovery - Stay updated with curated content

Start your journey at: https://aether.app

Questions? Just reply to this email.

- The Aether Team
    `;
  }

  getPremiumWelcomeEmailTemplate(userName, subscriptionDetails) {
    const { plan, price, currency, nextBillingDate } = subscriptionDetails || {};
    const formattedPrice = price ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(price) : 'N/A';

    const nextBilling = nextBillingDate ? 
      new Date(nextBillingDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long', 
        day: 'numeric'
      }) : 'N/A';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          .container { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000000; color: #ffffff; text-align: center; padding: 30px; }
          .content { padding: 30px 0; }
          .subscription-details { background: #f5f5f5; padding: 20px; margin: 20px 0; border: 1px solid #e5e5e5; }
          .feature { margin: 15px 0; padding: 10px; background: #ffffff; border-left: 4px solid #000000; }
          .footer { text-align: center; color: #666666; font-size: 14px; margin-top: 30px; }
          .button { background: #000000; color: #ffffff; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 10px 0; }
          .success-badge { background: #000000; color: #ffffff; padding: 8px 16px; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-badge">PREMIUM ACTIVATED</div>
            <h1>Welcome to Aether Premium</h1>
            <p>Your premium experience is now live</p>
          </div>
          
          <div class="content">
            <h2>Hi ${userName}</h2>
            <p>Welcome to Aether Premium! You now have access to our most advanced AI features and unlimited conversations.</p>
            
            ${subscriptionDetails ? `
            <div class="subscription-details">
              <h3>Subscription Details</h3>
              <p><strong>Plan:</strong> ${plan?.charAt(0).toUpperCase()}${plan?.slice(1)}</p>
              <p><strong>Amount:</strong> ${formattedPrice}</p>
              ${nextBillingDate ? `<p><strong>Next Billing:</strong> ${nextBilling}</p>` : '<p><strong>Billing:</strong> One-time payment</p>'}
            </div>
            ` : ''}

            <div class="feature">
              <h3>Your Premium Features</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Advanced AI Tools & Features</li>
                <li>Unlimited Daily Conversations</li>
                <li>Enhanced Analytics & Insights</li>
                <li>Priority Support</li>
                <li>Personalized Content Discovery</li>
                <li>Early Access to New Features</li>
                <li>Spotify Integration</li>
                <li>Advanced Social Features</li>
              </ul>
            </div>
            
            <p style="text-align: center;">
              <a href="https://aether.app" class="button">Explore Your Premium Features</a>
            </p>
          </div>
          
          <div class="footer">
            <p>Your subscription is secure and active</p>
            <p>Need help? Just reply to this email - we're here for you!</p>
            <p><small>Powered by Aether AI</small></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPremiumWelcomeEmailText(userName, subscriptionDetails) {
    const { plan, price, currency, nextBillingDate } = subscriptionDetails || {};
    const formattedPrice = price ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(price) : 'N/A';

    const nextBilling = nextBillingDate ? 
      new Date(nextBillingDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long', 
        day: 'numeric'
      }) : 'One-time payment';

    return `
PREMIUM ACTIVATED - Welcome to Aether Premium

Hi ${userName}

Welcome to Aether Premium! You now have access to our most advanced AI features and unlimited conversations.

${subscriptionDetails ? `
Subscription Details:
- Plan: ${plan?.charAt(0).toUpperCase()}${plan?.slice(1)}
- Amount: ${formattedPrice}
- Next Billing: ${nextBilling}
` : ''}

Your Premium Features:
- Advanced AI Tools & Features
- Unlimited Daily Conversations  
- Enhanced Analytics & Insights
- Priority Support
- Personalized Content Discovery
- Early Access to New Features
- Spotify Integration
- Advanced Social Features

Get started at: https://aether.app

Your subscription is secure and active
Need help? Just reply to this email - we're here for you!

- The Aether Team
Powered by Aether AI
    `;
  }
}

// Export singleton instance
export default new EmailService();