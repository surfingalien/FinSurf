ws.on('ping', () => ws.pong());
setInterval(() => ws.ping(), 30000);