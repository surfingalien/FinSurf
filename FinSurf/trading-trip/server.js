// server.js - WebSocket server for real-time updates
// Install: npm install ws
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Mock portfolio data (replace with database)
const portfolios = {
  personal: { totalValue: 69148, change: 31.88, todayPnl: -221, healthScore: 87 },
  trust: { totalValue: 84665, change: 24.12, todayPnl: 342, healthScore: 92 },
  ira: { totalValue: 60797, change: 18.45, todayPnl: 156, healthScore: 89 }
};

// Mock price data
let prices = {
  BTC: { price: 64102.40, change: 2.1 },
  ETH: { price: 3450.88, change: 1.4 },
  SOL: { price: 142.12, change: -0.8 },
  NVDA: { price: 202.06, change: 80.3 }
};

// Connected clients by portfolio subscription
const subscribers = { personal: [], trust: [], ira: [] };

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          // Subscribe client to portfolio updates
          const portfolio = data.portfolio || 'personal';
          if (!subscribers[portfolio].includes(ws)) {
            subscribers[portfolio].push(ws);
            console.log(`Client subscribed to ${portfolio}`);
            
            // Send initial portfolio data
            ws.send(JSON.stringify({
              type: 'portfolio_update',
              metrics: portfolios[portfolio]
            }));
          }
          break;
          
        case 'request_sync':
          // Force sync for subscribed portfolio
          const syncPortfolio = data.portfolio || 'personal';
          broadcastToPortfolio(syncPortfolio, {
            type: 'terminal_log',
            message: '✓ Manual sync completed',
            level: 'success'
          });
          break;
      }
    } catch (e) {
      console.error('Message parse error:', e);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    // Remove from all subscriber lists
    Object.values(subscribers).forEach(list => {
      const index = list.indexOf(ws);
      if (index > -1) list.splice(index, 1);
    });
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'terminal_log',
    message: '✓ Real-time updates enabled',
    level: 'success'
  }));
});

// Broadcast to all clients subscribed to a portfolio
function broadcastToPortfolio(portfolio, data) {
  const message = JSON.stringify(data);
  subscribers[portfolio].forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Simulate real-time price updates (replace with actual market data API)
setInterval(() => {
  // Randomly update 1-2 prices
  const symbols = Object.keys(prices);
  const updateCount = Math.floor(Math.random() * 2) + 1;
  
  for (let i = 0; i < updateCount; i++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const current = prices[symbol];
    
    // Simulate small price movement
    const changePercent = (Math.random() - 0.48) * 0.5; // -0.24% to +0.26%
    const newPrice = current.price * (1 + changePercent / 100);
    const newChange = current.change + (Math.random() - 0.5) * 0.3;
    
    prices[symbol] = {
      price: parseFloat(newPrice.toFixed(2)),
      change: parseFloat(newChange.toFixed(2))
    };
    
    // Broadcast price update to all subscribers
    Object.values(subscribers).forEach(list => {
      list.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'price_update',
            symbol: symbol,
            price: prices[symbol].price,
            change: prices[symbol].change
          }));
        }
      });
    });
  }
}, 5000); // Update every 5 seconds

// Simulate terminal logs and AI insights
setInterval(() => {
  const logs = [
    { message: 'Scanning for arbitrage opportunities...', level: 'info' },
    { message: '✓ Correlation matrix updated', level: 'success' },
    { message: '⚠ Unusual volume detected in tech sector', level: 'warning' }
  ];
  
  const randomLog = logs[Math.floor(Math.random() * logs.length)];
  
  // Broadcast to all connected clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'terminal_log',
        ...randomLog
      }));
    }
  });
  
  // Occasionally send AI insight
  if (Math.random() > 0.7) {
    const insights = [
      { type: 'alert', severity: 'info', text: 'Market momentum shifting. Review position sizing.' },
      { type: 'risk', severity: 'warning', text: 'Volatility index rising. Consider hedging strategies.' },
      { type: 'opportunity', severity: 'success', text: 'Sector rotation detected. Tech showing relative strength.' }
    ];
    
    const insight = insights[Math.floor(Math.random() * insights.length)];
    
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'ai_insight',
          insights: [insight]
        }));
      }
    });
  }
}, 15000);

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      clients: wss.clients.size,
      subscribers: Object.fromEntries(
        Object.entries(subscribers).map(([k, v]) => [k, v.length])
      )
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});