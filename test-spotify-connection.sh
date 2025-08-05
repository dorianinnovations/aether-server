#!/bin/bash

# Simple Spotify Connection Test
echo "🎵 TESTING SPOTIFY CONNECTION"
echo "============================="

# Wait for deployment
echo "⏳ Waiting for Render deployment..."
sleep 30

# Test the server with new config
echo "🌐 Testing updated server..."
HEALTH=$(curl -s "https://aether-server-j5kh.onrender.com/health")
echo "✅ Server health: $HEALTH"

echo
echo "📝 MANUAL TEST STEPS:"
echo "1. Go to your app and create/login to a test account"
echo "2. Navigate to Profile section" 
echo "3. Click 'Connect Spotify'"
echo "4. Authorize on Spotify (should redirect properly now)"
echo "5. Check if your current playing song appears"
echo
echo "🔗 Or test with the comprehensive script:"
echo "   node test-spotify.js"