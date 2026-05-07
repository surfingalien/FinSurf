// server.js — Trading-Trip full-stack server
// Express + WebSocket + JWT auth + real market data + Claude AI insights
'use strict';

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const Anthropic  = require('@anthropic-ai/sdk');

const PORT       = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('⚠  JWT_SECRET not set — using random secret (tokens reset on restart)');
    return require('crypto').randomUUID();
})();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── App setup ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── In-memory stores (replace with a DB for production) ──────────────────────
const users       = new Map();
const subscribers = { personal: new Set(), trust: new Set(), ira: new Set() };

// Pre-create demo account (password: demo1234)
bcrypt.hash('demo1234', 10).then(hash => {
    users.set('demo@trading-trip.dev', {
        email: 'demo@trading-trip.dev', hash, createdAt: new Date().toISOString()
    });
    console.log('👤 Demo account ready: demo@trading-trip.dev / demo1234');
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(header.slice(7), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token expired or invalid' });
    }
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password || password.length < 8)
        return res.status(400).json({ error: 'Valid email and password (8+ chars) required' });
    if (users.has(email))
        return res.status(409).json({ error: 'Account already exists' });
    const hash = await bcrypt.hash(password, 10);
    users.set(email, { email, hash, createdAt: new Date().toISOString() });
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, email });
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = users.get(email);
    if (!user || !(await bcrypt.compare(password ?? '', user.hash)))
        return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, email });
});

// ── Market data ───────────────────────────────────────────────────────────────
let priceCache    = {};
let lastFetchedAt = 0;

async function fetchURL(url, options = {}) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

async function fetchCryptoPrices() {
    const data = await fetchURL(
        'https://api.coingecko.com/api/v3/simple/price' +
        '?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
    );
    return {
        BTC: { price: data.bitcoin?.usd,  change: Number((data.bitcoin?.usd_24h_change  ?? 0).toFixed(2)) },
        ETH: { price: data.ethereum?.usd, change: Number((data.ethereum?.usd_24h_change ?? 0).toFixed(2)) },
        SOL: { price: data.solana?.usd,   change: Number((data.solana?.usd_24h_change   ?? 0).toFixed(2)) },
    };
}

async function fetchYahooStock(symbol) {
    const data = await fetchURL(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingTrip/1.0)' } }
    );
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) throw new Error(`No data for ${symbol}`);
    const price  = meta.regularMarketPrice;
    const prev   = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = Number((((price - prev) / prev) * 100).toFixed(2));
    return { price, change };
}

async function refreshPrices() {
    const now = Date.now();
    if (now - lastFetchedAt < 30_000 && Object.keys(priceCache).length > 0) return priceCache;

    const [crypto, nvda, tsm, tsla, coin] = await Promise.allSettled([
        fetchCryptoPrices(),
        fetchYahooStock('NVDA'),
        fetchYahooStock('TSM'),
        fetchYahooStock('TSLA'),
        fetchYahooStock('COIN'),
    ]);

    if (crypto.status === 'fulfilled') Object.assign(priceCache, crypto.value);
    for (const [result, sym] of [[nvda,'NVDA'],[tsm,'TSM'],[tsla,'TSLA'],[coin,'COIN']]) {
        if (result.status === 'fulfilled') priceCache[sym] = result.value;
        else console.warn(`⚠  ${sym}:`, result.reason?.message);
    }

    lastFetchedAt = Date.now();
    console.log(`📈 Prices refreshed: ${Object.keys(priceCache).join(', ')}`);
    return priceCache;
}

app.get('/api/prices', requireAuth, async (req, res) => {
    try { res.json(await refreshPrices()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Claude AI insights ────────────────────────────────────────────────────────
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

app.post('/api/insights', requireAuth, async (req, res) => {
    const { portfolio, positions } = req.body ?? {};

    if (!anthropic) {
        return res.json({ insights: [{
            type: 'alert', severity: 'warning',
            text: 'Set ANTHROPIC_API_KEY in Railway env vars to enable live AI insights.'
        }] });
    }

    const prices  = await refreshPrices();
    const priceCtx = Object.entries(prices)
        .map(([s, d]) => `${s} $${d.price?.toFixed(2)} (${d.change >= 0 ? '+' : ''}${d.change}%)`)
        .join(', ');
    const posCtx = (positions ?? [])
        .map(p => `${p.asset} qty=${p.qty} cost=$${p.avgCost} live=$${p.price} val=$${p.value}`)
        .join('; ');

    try {
        const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            system: `You are a concise trading analyst. Return ONLY a JSON array of exactly 3 objects:
[{"type":"alert"|"risk"|"opportunity","severity":"info"|"warning"|"success","text":"<max 30 words>"}]
No markdown. No explanation. Pure JSON array only.`,
            messages: [{
                role: 'user',
                content: `Portfolio: ${portfolio}. Positions: ${posCtx || 'none'}. Live prices: ${priceCtx}. Generate 3 actionable insights.`
            }]
        });

        const raw     = msg.content[0].text.trim();
        const match   = raw.match(/\[[\s\S]*\]/);
        const insights = match ? JSON.parse(match[0]) : [{ type: 'alert', severity: 'info', text: raw.slice(0, 80) }];
        res.json({ insights });
    } catch (err) {
        console.error('Claude API error:', err.message);
        res.status(500).json({ error: 'AI insights unavailable' });
    }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: `${Math.round(process.uptime())}s`,
        wsClients: wss.clients.size,
        pricesLoaded: Object.keys(priceCache).length,
        aiEnabled: !!anthropic,
    });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
    const url       = new URL(req.url, `ws://${req.headers.host}`);
    const token     = url.searchParams.get('token');
    let   userEmail = null;

    if (token) {
        try { userEmail = jwt.verify(token, JWT_SECRET).email; }
        catch { ws.close(4001, 'Invalid token'); return; }
    }

    console.log(`🔌 WS connected${userEmail ? ` [${userEmail}]` : ''}`);

    ws.send(JSON.stringify({
        type: 'terminal_log',
        message: `✓ Secure channel open${userEmail ? ` — ${userEmail}` : ''}`,
        level: 'success'
    }));

    ws.on('message', async (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'subscribe' && subscribers[msg.portfolio]) {
                Object.values(subscribers).forEach(s => s.delete(ws));
                subscribers[msg.portfolio].add(ws);
                const prices = await refreshPrices();
                ws.send(JSON.stringify({ type: 'prices_snapshot', prices }));
            }
        } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
        Object.values(subscribers).forEach(s => s.delete(ws));
        console.log(`🔌 WS disconnected${userEmail ? ` [${userEmail}]` : ''}`);
    });

    ws.on('error', err => console.error('WS error:', err.message));
});

function broadcastAll(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of wss.clients)
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
}

// ── Background jobs ───────────────────────────────────────────────────────────
// Broadcast real prices every 30 s
setInterval(async () => {
    try {
        const prices = await refreshPrices();
        for (const [symbol, data] of Object.entries(prices))
            broadcastAll({ type: 'price_update', symbol, price: data.price, change: data.change });
    } catch { /* logged in refreshPrices */ }
}, 30_000);

// Broadcast terminal log noise every 20 s
const LOGS = [
    { message: '✓ Correlation matrix recalculated', level: 'success' },
    { message: 'Scanning sector momentum patterns...', level: 'info' },
    { message: '⚠ Elevated VIX — volatility regime active', level: 'warning' },
    { message: 'Cross-asset risk scan complete', level: 'success' },
    { message: 'Institutional accumulation detected in tech sector', level: 'info' },
];
setInterval(() => {
    broadcastAll({ type: 'terminal_log', ...LOGS[Math.floor(Math.random() * LOGS.length)] });
}, 20_000);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n🚀 Trading-Trip  →  http://localhost:${PORT}`);
    console.log(`🔌 WebSocket     →  ws://localhost:${PORT}/ws`);
    console.log(`🤖 Claude AI     →  ${anthropic ? 'enabled ✓' : 'disabled (set ANTHROPIC_API_KEY)'}\n`);
    refreshPrices().catch(() => {});
});

process.on('SIGTERM', () => { wss.close(); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { wss.close(); server.close(() => process.exit(0)); });
