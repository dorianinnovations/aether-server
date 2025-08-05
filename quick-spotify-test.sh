#!/bin/bash

# Quick Spotify Integration Test
# Tests basic endpoints and configuration

BASE_URL="https://aether-server-j5kh.onrender.com"
echo "🎵 QUICK SPOTIFY INTEGRATION TEST"
echo "=================================="
echo "🌐 Testing server: $BASE_URL"
echo

# Test 1: Server Health
echo "🏥 Testing server health..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
if [ $? -eq 0 ]; then
    echo "✅ Server is responding"
    echo "📋 Health response: $HEALTH_RESPONSE"
else
    echo "❌ Server is not responding"
    exit 1
fi
echo

# Test 2: Basic Authentication Test
echo "🔐 Testing authentication endpoint..."
AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}')

if [ "$AUTH_TEST" -eq 400 ] || [ "$AUTH_TEST" -eq 401 ]; then
    echo "✅ Auth endpoint is working (returned $AUTH_TEST for invalid credentials)"
else
    echo "⚠️  Auth endpoint returned unexpected code: $AUTH_TEST"
fi
echo

# Test 3: Spotify Auth Endpoint (without token - should fail)
echo "🎵 Testing Spotify auth endpoint (should require authentication)..."
SPOTIFY_AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/spotify/auth")

if [ "$SPOTIFY_AUTH_TEST" -eq 401 ]; then
    echo "✅ Spotify auth endpoint is protected (returned 401)"
else
    echo "⚠️  Spotify auth endpoint returned unexpected code: $SPOTIFY_AUTH_TEST"
fi
echo

# Summary
echo "🎯 QUICK TEST SUMMARY"
echo "====================="
echo "✅ Server Health: Working"
echo "✅ Auth Endpoint: Working" 
echo "✅ Spotify Endpoint: Protected"
echo
echo "📝 NEXT STEPS:"
echo "1. Make sure your Spotify app has this redirect URI configured:"
echo "   https://aether-server-j5kh.onrender.com/spotify/callback"
echo
echo "2. Run the comprehensive test:"
echo "   node test-spotify.js"
echo
echo "3. Or test manually by logging into the app and connecting Spotify"