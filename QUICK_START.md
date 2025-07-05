# 🚀 Numina Server - Quick Start Guide

## Get Your SaaS Running in 5 Minutes

### Option 1: Railway (Recommended - Easiest)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy to Railway**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Add environment variables (see below)
   - Deploy!

3. **Set Environment Variables in Railway**
   ```
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/numina
   JWT_SECRET=your-super-secret-key-here
   LLAMA_CPP_API_URL=https://your-llm-api.com/completion
   NODE_ENV=production
   ```

### Option 2: Render (Alternative)

1. **Go to Render**
   - Visit [render.com](https://render.com)
   - Sign up with GitHub

2. **Create Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Set build command: `npm install`
   - Set start command: `npm start`

3. **Add Environment Variables**
   - Same as Railway above

### Option 3: Heroku (Traditional)

1. **Install Heroku CLI**
   ```bash
   curl https://cli-assets.heroku.com/install.sh | sh
   ```

2. **Deploy**
   ```bash
   heroku login
   heroku create your-app-name
   heroku addons:create mongolab:sandbox
   git push heroku main
   ```

## Database Setup (MongoDB Atlas)

1. **Create MongoDB Atlas Account**
   - Go to [mongodb.com/atlas](https://mongodb.com/atlas)
   - Sign up for free account

2. **Create Cluster**
   - Click "Build a Database"
   - Choose "FREE" tier
   - Select cloud provider & region
   - Click "Create"

3. **Get Connection String**
   - Click "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database password

## Environment Variables

Create a `.env` file in your project root:

```env
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/numina

# Security
JWT_SECRET=your-super-secret-jwt-key-here

# LLM API
LLAMA_CPP_API_URL=https://your-llm-api.com/completion

# Server
PORT=5000
NODE_ENV=production
```

## Test Your Deployment

Once deployed, test your endpoints:

```bash
# Health check
curl https://your-app.railway.app/health

# Signup
curl -X POST https://your-app.railway.app/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST https://your-app.railway.app/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Next Steps

1. **Set up monitoring** - Use Railway/Render's built-in monitoring
2. **Configure custom domain** - Add your domain in platform settings
3. **Set up alerts** - Configure notifications for downtime
4. **Scale up** - Upgrade plans as you grow

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check MONGO_URI format
   - Verify network access in MongoDB Atlas
   - Check credentials

2. **JWT Token Issues**
   - Ensure JWT_SECRET is set
   - Check token expiration
   - Verify token format

3. **LLM API Unreachable**
   - Check LLAMA_CPP_API_URL
   - Verify API is running
   - Test network connectivity

### Debug Commands

```bash
# Check logs
railway logs        # Railway
render logs         # Render
heroku logs --tail  # Heroku

# Check status
curl https://your-app.com/health
curl https://your-app.com/status
```

## Cost Breakdown

### Free Tier (Starting)
- **Railway**: $0/month (500 hours)
- **Render**: $0/month (750 hours)
- **Heroku**: $0/month (550 hours)
- **MongoDB Atlas**: $0/month (512MB)

### Growth Phase
- **Railway**: $5-20/month
- **Render**: $7-25/month
- **Heroku**: $7-25/month
- **MongoDB Atlas**: $9-57/month

## Support

- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Render**: [render.com/docs](https://render.com/docs)
- **Heroku**: [devcenter.heroku.com](https://devcenter.heroku.com)
- **MongoDB**: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)

---

**🎉 Congratulations!** Your Numina AI assistant is now live as a SaaS application! 