// Add JWT verification on connection
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  if (!verifyToken(token)) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  // ... existing connection logic
});