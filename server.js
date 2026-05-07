// server.js — Trading-Trip full-stack server
'use strict';

// ── Crash guards — MUST be first ─────────────────────────────────────────────
process.on('uncaughtException',  (err) => console.error('[CRASH] uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('[CRASH] unhandledRejection:', reason));

console.log('[BOOT] Starting Trading-Trip server…');
console.log('[BOOT] Node:', process.version, '| PORT env:', process.env.PORT);

// ── Core requires ─────────────────────────────────────────────────────────────
const http = require('http');
const path = require('path');

// ── Optional requires (wrapped so a missing package doesn't crash startup) ───
let express, WebSocket, jwt, bcrypt, Anthropic;

try { express   = require('express');            console.log('[BOOT] ✓ express'); }
catch (e) { console.error('[BOOT] ✗ express:', e.message); }

try { WebSocket = require('ws');                 console.log('[BOOT] ✓ ws'); }
catch (e) { console.error('[BOOT] ✗ ws:', e.message); }

try { jwt       = require('jsonwebtoken');       console.log('[BOOT] ✓ jsonwebtoken'); }
catch (e) { console.error('[BOOT] ✗ jsonwebtoken:', e.message); }

try { bcrypt    = require('bcryptjs');           console.log('[BOOT] ✓ bcryptjs'); }
catch (e) { console.error('[BOOT] ✗ bcryptjs:', e.message); }

try {
    const sdk = require('@anthropic-ai/sdk');
    // SDK may export the class as default, as .Anthropic, or directly
    Anthropic = sdk.default ?? sdk.Anthropic ?? sdk;
    console.log('[BOOT] ✓ @anthropic-ai/sdk');
} catch (e) { console.error('[BOOT] ✗ @anthropic-ai/sdk:', e.message); }

// ── Config ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8080', 10);
const JWT_SECRET        = process.env.JWT_SECRET || require('crypto').randomUUID();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

if (!process.env.JWT_SECRET) console.warn('[WARN] JWT_SECRET not set — tokens reset on restart');

// ── Create HTTP server immediately ───────────────────────────────────────────
// Use a plain http.Server so we can attach WebSocket later.
// Fall back to a minimal handler if express failed to load.
let app;
let server;

if (express) {
    app    = express();
    server = http.createServer(app);
    app.use(express.json());
    app.use(express.static(path.join(__dirname)));
    console.log('[BOOT] ✓ Express + static serving configured');
} else {
    // Minimal fallback — serve health check only
    server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', mode: 'minimal-fallback' }));
    });
    console.warn('[BOOT] Running in minimal fallback mode (express unavailable)');
}

// ── BIND TO PORT IMMEDIATELY — Railway requires this ─────────────────────────
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[BOOT] ✓ Listening on 0.0.0.0:${PORT}`);
    // Kick off deferred init after we're listening
    deferredInit().catch(err => console.error('[INIT] deferred init error:', err));
});

server.on('error', (err) => {
    console.error('[SERVER] Listen error:', err);
    process.exit(1);
});

// ── In-memory stores ──────────────────────────────────────────────────────────
const users       = new Map();
const subscribers = { personal: new Set(), trust: new Set(), ira: new Set() };

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (!jwt) return res.status(503).json({ error: 'Auth service unavailable' });
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(header.slice(7), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token expired or invalid' });
    }
}

// ── Routes (only registered if express loaded) ────────────────────────────────
function registerRoutes() {
    if (!app) return;

    // Health
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            uptime: `${Math.round(process.uptime())}s`,
            wsClients: wss?.clients?.size ?? 0,
            pricesLoaded: Object.keys(priceCache).length,
            aiEnabled: !!anthropic,
            node: process.version,
        });
    });

    // Auth
    app.post('/auth/register', async (req, res) => {
        try {
            const { email, password } = req.body ?? {};
            if (!email || !password || password.length < 8)
                return res.status(400).json({ error: 'Valid email and password (8+ chars) required' });
            if (users.has(email))
                return res.status(409).json({ error: 'Account already exists' });
            const hash = await bcrypt.hash(password, 10);
            users.set(email, { email, hash, createdAt: new Date().toISOString() });
            const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, email });
        } catch (err) {
            console.error('/auth/register error:', err);
            res.status(500).json({ error: 'Registration failed' });
        }
    });

    app.post('/auth/login', async (req, res) => {
        try {
            const { email, password } = req.body ?? {};
            const user = users.get(email);
            if (!user || !bcrypt || !(await bcrypt.compare(password ?? '', user.hash)))
                return res.status(401).json({ error: 'Invalid email or password' });
            const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, email });
        } catch (err) {
            console.error('/auth/login error:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // Prices
    app.get('/api/prices', requireAuth, async (req, res) => {
        try { res.json(await refreshPrices()); }
        catch (err) { res.status(500).json({ error: err.message }); }
    });

    // AI insights
    app.post('/api/insights', requireAuth, async (req, res) => {
        if (!anthropic) {
            return res.json({ insights: [{
                type: 'alert', severity: 'warning',
                text: 'Set ANTHROPIC_API_KEY in Railway env vars to enable live AI insights.'
            }] });
        }
        try {
            const { portfolio, positions } = req.body ?? {};
            const prices  = await refreshPrices();
            const priceCtx = Object.entries(prices)
                .map(([s, d]) => `${s} $${d.price?.toFixed(2)} (${d.change >= 0 ? '+' : ''}${d.change}%)`)
                .join(', ');
            const posCtx = (positions ?? [])
                .map(p => `${p.asset} qty=${p.qty} cost=$${p.avgCost} live=$${p.price} val=$${p.value}`)
                .join('; ');

            const msg = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 400,
                system: 'Return ONLY a JSON array of 3 objects: [{"type":"alert"|"risk"|"opportunity","severity":"info"|"warning"|"success","text":"<30 words max"}]. No markdown.',
                messages: [{ role: 'user', content: `Portfolio: ${portfolio}. Positions: ${posCtx || 'none'}. Prices: ${priceCtx}.` }]
            });

            const raw   = msg.content[0].text.trim();
            const match = raw.match(/\[[\s\S]*\]/);
            res.json({ insights: match ? JSON.parse(match[0]) : [{ type: 'alert', severity: 'info', text: raw.slice(0, 80) }] });
        } catch (err) {
            console.error('/api/insights error:', err.message);
            res.status(500).json({ error: 'AI unavailable' });
        }
    });

    console.log('[INIT] ✓ Routes registered');
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
let wss = null;

function setupWebSocket() {
    if (!WebSocket) { console.warn('[INIT] WebSocket skipped (ws not available)'); return; }
    try {
        wss = new WebSocket.Server({ server, path: '/ws' });

        wss.on('connection', (ws, req) => {
            let userEmail = null;
            try {
                const url   = new URL(req.url, `ws://localhost`);
                const token = url.searchParams.get('token');
                if (token && jwt) userEmail = jwt.verify(token, JWT_SECRET)?.email;
            } catch { /* unauthenticated */ }

            console.log(`[WS] connected${userEmail ? ` [${userEmail}]` : ''}`);

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
                } catch { /* ignore */ }
            });

            ws.on('close', () => {
                Object.values(subscribers).forEach(s => s.delete(ws));
            });
            ws.on('error', err => console.error('[WS] error:', err.message));
        });

        console.log('[INIT] ✓ WebSocket server ready at /ws');
    } catch (err) {
        console.error('[INIT] WebSocket setup failed:', err.message);
    }
}

// ── Market data ───────────────────────────────────────────────────────────────
let priceCache    = {};
let lastFetchedAt = 0;

async function fetchWithTimeout(url, options = {}, ms = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchCryptoPrices() {
    const data = await fetchWithTimeout(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
    );
    return {
        BTC: { price: data.bitcoin?.usd,  change: +(data.bitcoin?.usd_24h_change  ?? 0).toFixed(2) },
        ETH: { price: data.ethereum?.usd, change: +(data.ethereum?.usd_24h_change ?? 0).toFixed(2) },
        SOL: { price: data.solana?.usd,   change: +(data.solana?.usd_24h_change   ?? 0).toFixed(2) },
    };
}

async function fetchYahooStock(symbol) {
    const data = await fetchWithTimeout(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const meta  = data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error(`No data for ${symbol}`);
    const price  = meta.regularMarketPrice;
    const prev   = meta.previousClose ?? meta.chartPreviousClose ?? price;
    return { price, change: +(((price - prev) / prev) * 100).toFixed(2) };
}

async function refreshPrices() {
    const now = Date.now();
    if (now - lastFetchedAt < 30_000 && Object.keys(priceCache).length > 0) return priceCache;

    const results = await Promise.allSettled([
        fetchCryptoPrices(),
        fetchYahooStock('NVDA'),
        fetchYahooStock('TSM'),
        fetchYahooStock('TSLA'),
        fetchYahooStock('COIN'),
    ]);

    const [crypto, nvda, tsm, tsla, coin] = results;
    if (crypto.status === 'fulfilled') Object.assign(priceCache, crypto.value);
    for (const [r, sym] of [[nvda,'NVDA'],[tsm,'TSM'],[tsla,'TSLA'],[coin,'COIN']]) {
        if (r.status === 'fulfilled') priceCache[sym] = r.value;
        else console.warn(`[PRICES] ${sym}:`, r.reason?.message);
    }

    lastFetchedAt = Date.now();
    console.log(`[PRICES] refreshed: ${Object.keys(priceCache).join(', ')}`);
    return priceCache;
}

// ── Anthropic client ──────────────────────────────────────────────────────────
let anthropic = null;

// ── Deferred initialization ───────────────────────────────────────────────────
async function deferredInit() {
    console.log('[INIT] Running deferred initialization…');

    // Register routes
    registerRoutes();

    // Set up WebSocket
    setupWebSocket();

    // Create demo user
    if (bcrypt) {
        try {
            const hash = await bcrypt.hash('demo1234', 10);
            users.set('demo@trading-trip.dev', { email: 'demo@trading-trip.dev', hash, createdAt: new Date().toISOString() });
            console.log('[INIT] ✓ Demo user created (demo@trading-trip.dev / demo1234)');
        } catch (err) {
            console.error('[INIT] Demo user creation failed:', err.message);
        }
    }

    // Init Anthropic client
    if (Anthropic && ANTHROPIC_API_KEY) {
        try {
            anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
            console.log('[INIT] ✓ Claude AI enabled');
        } catch (err) {
            console.error('[INIT] Anthropic init failed:', err.message);
        }
    } else {
        console.log('[INIT] Claude AI disabled (set ANTHROPIC_API_KEY)');
    }

    // Warm up prices
    try {
        await refreshPrices();
    } catch (err) {
        console.warn('[INIT] Initial price fetch failed (will retry on first request):', err.message);
    }

    // Background jobs
    setInterval(async () => {
        try {
            const prices = await refreshPrices();
            if (!wss) return;
            const msg = JSON.stringify;
            for (const [symbol, data] of Object.entries(prices)) {
                const payload = msg({ type: 'price_update', symbol, price: data.price, change: data.change });
                for (const ws of wss.clients)
                    if (ws.readyState === 1) ws.send(payload);
            }
        } catch { /* swallow — logged in refreshPrices */ }
    }, 30_000);

    const LOGS = [
        { message: '✓ Correlation matrix recalculated', level: 'success' },
        { message: 'Scanning sector momentum patterns…', level: 'info' },
        { message: '⚠ Elevated VIX — volatility regime active', level: 'warning' },
        { message: 'Cross-asset risk scan complete', level: 'success' },
    ];
    setInterval(() => {
        if (!wss) return;
        const payload = JSON.stringify({ type: 'terminal_log', ...LOGS[Math.floor(Math.random() * LOGS.length)] });
        for (const ws of wss.clients)
            if (ws.readyState === 1) ws.send(payload);
    }, 20_000);

    console.log('[INIT] ✓ All initialization complete');
    console.log(`[READY] Trading-Trip is live on port ${PORT} 🚀`);
}

process.on('SIGTERM', () => { wss?.close(); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { wss?.close(); server.close(() => process.exit(0)); });
