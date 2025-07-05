# Numina Server - SaaS Deployment Guide

## Overview
This guide covers the easiest, most stable, and most practiced deployment strategies for hosting Numina as a SaaS application.

## Recommended Deployment Strategy

### 1. **Railway.app** (Recommended for Solo Devs)
**Why Railway?**
- Zero configuration deployment
- Automatic SSL certificates
- Built-in MongoDB hosting
- Free tier available
- GitHub integration
- Automatic deployments

**Steps:**
1. Push code to GitHub
2. Connect Railway to GitHub repo
3. Add environment variables
4. Deploy automatically

### 2. **Render.com** (Alternative)
**Why Render?**
- Free tier available
- Easy MongoDB integration
- Automatic deployments
- Built-in monitoring

### 3. **Heroku** (Traditional)
**Why Heroku?**
- Mature platform
- Extensive documentation
- Good free tier (limited)
- Easy scaling

## Environment Configuration

### Required Environment Variables
```env
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/numina?retryWrites=true&w=majority

# Security
JWT_SECRET=your-super-secret-jwt-key-here

# LLM API
LLAMA_CPP_API_URL=https://your-llm-api.com/completion

# Server
PORT=5000
NODE_ENV=production

# Logging
LOG_LEVEL=info
```

### Optional Environment Variables
```env
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS=https://your-frontend.com,http://localhost:3000

# Analytics
ANALYTICS_ENABLED=true
```

## Database Setup

### MongoDB Atlas (Recommended)
1. Create MongoDB Atlas account
2. Create new cluster (free tier available)
3. Create database user
4. Get connection string
5. Add to environment variables

### Local MongoDB (Development)
```bash
# Install MongoDB locally
sudo apt-get install mongodb

# Start MongoDB
sudo systemctl start mongodb
```

## Production Checklist

### Security
- [ ] JWT_SECRET is strong and unique
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] Helmet security headers are active
- [ ] Input validation is working
- [ ] Error messages don't leak sensitive info

### Performance
- [ ] Database indexes are created
- [ ] Connection pooling is configured
- [ ] Caching is implemented
- [ ] Compression is enabled
- [ ] Memory monitoring is active

### Monitoring
- [ ] Health check endpoint is working
- [ ] Logging is configured
- [ ] Error tracking is set up
- [ ] Performance metrics are collected

### Backup & Recovery
- [ ] Database backups are scheduled
- [ ] Environment variables are backed up
- [ ] Deployment rollback plan exists

## Deployment Steps

### 1. Prepare Your Code
```bash
# Ensure all tests pass
npm test

# Build for production (if needed)
npm run build

# Check for security vulnerabilities
npm audit
```

### 2. Choose Your Platform

#### Railway.app (Recommended)
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Create new project
4. Connect your GitHub repository
5. Add environment variables
6. Deploy

#### Render.com
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Create new Web Service
4. Connect your repository
5. Configure environment variables
6. Deploy

#### Heroku
1. Install Heroku CLI
2. Create Heroku app
3. Add MongoDB add-on
4. Configure environment variables
5. Deploy

### 3. Post-Deployment
1. Test all endpoints
2. Verify database connection
3. Check logs for errors
4. Monitor performance
5. Set up alerts

## Scaling Considerations

### Horizontal Scaling
- Use load balancers
- Implement session management
- Configure database clustering

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Implement caching strategies

### Cost Optimization
- Use free tiers initially
- Monitor resource usage
- Implement auto-scaling
- Optimize database queries

## Monitoring & Maintenance

### Health Checks
- Database connectivity
- External API availability
- Memory usage
- Response times

### Logging
- Request/response logs
- Error tracking
- Performance metrics
- User activity

### Alerts
- Server downtime
- High error rates
- Performance degradation
- Security incidents

## Security Best Practices

### Authentication
- Use strong JWT secrets
- Implement token refresh
- Add rate limiting
- Monitor failed login attempts

### Data Protection
- Encrypt sensitive data
- Use HTTPS everywhere
- Implement input sanitization
- Regular security audits

### API Security
- Validate all inputs
- Implement proper CORS
- Use security headers
- Monitor for suspicious activity

## Troubleshooting

### Common Issues
1. **Database Connection Failed**
   - Check MONGO_URI
   - Verify network access
   - Check credentials

2. **JWT Token Issues**
   - Verify JWT_SECRET
   - Check token expiration
   - Validate token format

3. **LLM API Unreachable**
   - Check LLAMA_CPP_API_URL
   - Verify API credentials
   - Test network connectivity

4. **High Memory Usage**
   - Check for memory leaks
   - Optimize database queries
   - Implement caching

### Debug Commands
```bash
# Check server status
curl https://your-app.com/health

# Test database connection
curl https://your-app.com/status

# Monitor logs
heroku logs --tail  # (Heroku)
railway logs        # (Railway)
```

## Cost Estimation

### Free Tier (Starting Point)
- **Railway**: $0/month (limited usage)
- **Render**: $0/month (limited usage)
- **Heroku**: $0/month (limited usage)
- **MongoDB Atlas**: $0/month (512MB)

### Paid Tier (Growth)
- **Railway**: $5-20/month
- **Render**: $7-25/month
- **Heroku**: $7-25/month
- **MongoDB Atlas**: $9-57/month

## Next Steps

1. **Choose deployment platform** (Railway recommended)
2. **Set up MongoDB Atlas** database
3. **Configure environment variables**
4. **Deploy application**
5. **Set up monitoring and alerts**
6. **Implement backup strategy**
7. **Plan for scaling**

## Support Resources

- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)
- [Heroku Documentation](https://devcenter.heroku.com)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com) 