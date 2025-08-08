// Check user ID from JWT token
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const token = process.argv[2];
if (!token) {
  console.log('Usage: node scripts/whoami.mjs <JWT_TOKEN>');
  process.exit(1);
}

try {
  const payload = jwt.decode(token);
  console.log('[WHOAMI]', payload);
} catch (error) {
  console.error('[ERROR]', error.message);
}