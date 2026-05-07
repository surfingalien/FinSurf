# 1. Install Node.js dependencies
cd trading-trip
npm init -y
npm install ws

# 2. Start WebSocket server
node server.js

# 3. Serve frontend (point to ws://localhost:8080)
# Update WS_URL in index.html if needed:
# const WS_URL = 'ws://localhost:8080';

# 4. Open http://localhost:8000 (or your static server)