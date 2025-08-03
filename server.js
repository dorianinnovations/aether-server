// Wrapper file for Render deployment
// This file exists because Render is configured to run 'node server.js'
// but the actual clean server is at src/server-clean.js

import('./src/server-clean.js');
