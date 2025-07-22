import { io } from 'socket.io-client';
import fetch from 'node-fetch';

console.log('🎧 Simple WebSocket Listener...\n');

// Get auth token
const response = await fetch('http://localhost:5000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'testuser1@example.com',
    password: 'testpass123'
  })
});

const { token } = await response.json();
console.log('✅ Got auth token');

// Connect WebSocket
const socket = io('http://localhost:5000', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('✅ WebSocket connected');
});


socket.on('disconnect', () => {
  console.log('❌ WebSocket disconnected');
});

console.log('🎧 Listening for WebSocket events...');
console.log('💬 Send a message in another terminal to test!\n');

// Keep alive
setInterval(() => {
  console.log('📡 Still listening...');
}, 30000);
