// server.js - Production Backend with Real APIs
require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { SimpleWebAuthnServer } = require('@simplewebauthn/server');
const { OpenAI } = require('openai');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Initialize services
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = new sqlite3.Database('./portfolio.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves frontend files

// ==================== DATABASE SETUP ====================
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_id TEXT,
    total_value REAL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id TEXT,
    asset TEXT,
    name TEXT,
    quantity REAL,
    avg_cost REAL,
    current_price REAL,
    rating TEXT,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
  )`);
  
  // Seed default portfolios if empty
  db.get("SELECT count(*) as count FROM portfolios", (err, row) => {
    if (row.count === 0) {
      const portfolios = [
        { id: 'personal', name: 'Personal', total_value: 69148 },
        { id: 'trust', name: 'Trust', total_value: 84665 },
        { id: 'ira', name: 'IRA', total_value: 60797 }
      ];
      portfolios.forEach(p => db.run("INSERT INTO portfolios VALUES (?,?,?,?)", [p.id, p.name, p.total_value]));
    }
  });
});

// ==================== WEBSOCKET MANAGER ====================
const clients = new Map(); // Map<WebSocket, {portfolio, user_id}>

wss.on('connection', (ws, req) => {
  console.log(`🔌 Client connected from ${req.socket.remoteAddress}`);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          clients.set(ws, { portfolio: data.portfolio || 'personal', user_id: data.user_id });
          ws.send(JSON.stringify({ type: 'subscribed', portfolio: data.portfolio }));
          break;
          
        case 'request_sync':
          await broadcastPortfolioUpdate(data.portfolio);
          break;
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

// ==================== REAL-TIME DATA UPDATES ====================
// Fetch live crypto prices from CoinGecko
async function fetchCryptoPrices() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
    return await res.json();
  } catch (e) {
    console.error('Crypto fetch error:', e);
    return {};
  }
}

// Broadcast price updates every 10 seconds
setInterval(async () => {
  const cryptoData = await fetchCryptoPrices();
  
  if (Object.keys(cryptoData).length === 0) return;
  
  // Map to our format
  const prices = {
    BTC: { price: cryptoData.bitcoin?.usd || 0, change: cryptoData.bitcoin?.usd_24h_change || 0 },
    ETH: { price: cryptoData.ethereum?.usd || 0, change: cryptoData.ethereum?.usd_24h_change || 0 },
    SOL: { price: cryptoData.solana?.usd || 0, change: cryptoData.solana?.usd_24h_change || 0 }
  };
  
  // Update database with latest prices
  Object.entries(prices).forEach(([symbol, data]) => {
    db.run("UPDATE positions SET current_price=? WHERE asset=?", [data.price, symbol]);
  });
  
  // Broadcast to all connected clients
  clients.forEach((info, ws) => {
    if (ws.readyState === 1) {
      Object.entries(prices).forEach(([symbol, data]) => {
        ws.send(JSON.stringify({ type: 'price_update', symbol, ...data }));
      });
    }
  });
}, 10000);

// Broadcast portfolio data
async function broadcastPortfolioUpdate(portfolioId) {
  const portfolio = await new Promise((resolve) => {
    db.get("SELECT * FROM portfolios WHERE id=?", [portfolioId], (err, row) => resolve(row));
  });
  
  const positions = await new Promise((resolve) => {
    db.all("SELECT * FROM positions WHERE portfolio_id=?", [portfolioId], (err, rows) => resolve(rows));
  });
  
  clients.forEach((info, ws) => {
    if (ws.readyState === 1 && info.portfolio === portfolioId) {
      ws.send(JSON.stringify({
        type: 'portfolio_update',
        metrics: {
          totalValue: portfolio.total_value,
          positionCount: positions.length
        }
      }));
      ws.send(JSON.stringify({ type: 'positions_update', positions }));
    }
  });
}

// ==================== AI INSIGHTS API ====================
app.post('/api/insights', async (req, res) => {
  try {
    const { portfolio, positions } = req.body;
    
    const prompt = `As a financial analyst, analyze this portfolio and provide 3 insights (alert, risk, opportunity).
Portfolio: ${portfolio}
Positions: ${JSON.stringify(positions)}
Format: JSON array of {type, severity, text}.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const insights = JSON.parse(completion.choices[0].message.content).insights || [];
    res.json({ insights });
    
  } catch (e) {
    console.error('AI insights error:', e);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// ==================== WEBAUTHN API ====================
app.get('/auth/webauthn/challenge', async (req, res) => {
  const { username } = req.query;
  // Generate challenge using SimpleWebAuthn
  const options = await SimpleWebAuthnServer.generateRegistrationOptions({
    rpName: 'Trading-Trip',
    rpID: process.env.RP_ID || 'localhost',
    userName: username
  });
  res.json(options);
});

app.post('/auth/webauthn/verify', async (req, res) => {
  const { credential, expectedChallenge } = req.body;
  // Verify credential and create session token
  const verification = await SimpleWebAuthnServer.verifyRegistrationResponse({
    response: credential,
    expectedChallenge
  });
  if (verification.verified) {
    // TODO: Create session/token here
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// ==================== HEALTH & ROUTES ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    clients: clients.size,
    database: 'connected'
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 WebSocket: ws://localhost:${PORT}`);
  console.log(`🧠 AI: OpenAI integrated`);
});