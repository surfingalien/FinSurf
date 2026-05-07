# Trading-Trip Operations Room 🚀

Production-grade portfolio dashboard with real-time updates, AI insights, and biometric security.

## ✨ Features Implemented

| Feature | Status | Description |
|---------|--------|-------------|
| **WebSocket Live Updates** | ✅ | Real-time price ticks, terminal logs, portfolio sync |
| **PWA Installation** | ✅ | Offline access, install prompt, service worker caching |
| **Biometric Auth** | ✅ | WebAuthn integration for Face ID / fingerprint login |
| **AI Insights Panel** | ✅ | LLM-powered trade suggestions (mock API ready) |
| **Multi-Portfolio Toggle** | ✅ | Switch between Personal/Trust/IRA accounts |

## 🚀 Quick Start

### Frontend Only (Static Hosting)
```bash
# 1. Clone or download files
git clone https://github.com/surfingalien/FinSurf.git
cd trading-trip

# 2. Serve with any static server
# Python
python3 -m http.server 8000
# Node
npx serve .
# Or deploy to GitHub Pages, Vercel, Netlify

# 3. Open http://localhost:8000
```

### Full Stack (With WebSocket Server)

```bash
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
```

### Biometric Auth Setup (Production)
WebAuthn requires a backend for challenge generation and verification:

1. Backend Endpoints Needed:

GET  /auth/webauthn/challenge?username=USER
POST /auth/webauthn/verify
GET  /auth/webauthn/credentials?username=USER

Challenge Flow
Client → Backend: Request challenge
Backend → Client: Return base64url challenge
Client: navigator.credentials.get/create()
Client → Backend: Send assertion/credential
Backend: Verify signature & update session


1. Recommended Libraries:
    * Node.js: @simplewebauthn/server
    * Python: webauthn
    * Go: github.com/go-webauthn/webauthn

### PWA Deployment Checklist
* manifest.json configured
* Service worker (sw.js) registered
* HTTPS enabled (required for PWA install)
* **Icons generated** (see below)
* Add apple-touch-icon for iOS
* Test offline functionality (DevTools → Application → Service Workers)

### Generate PWA Icons
The placeholder icons need to be replaced with actual PNG files:

```bash
# Option 1: Use the provided script (requires ImageMagick)
chmod +x generate-icons.sh
./generate-icons.sh

# Option 2: Manual generation
# 1. Open icons/icon-source.svg in browser or image editor
# 2. Export as PNG: 192x192 → icon-192.png, 512x512 → icon-512.png
# 3. For maskable icons, add 20% padding around the design

# Option 3: Online tools
# Use https://favicon.io/favicon-converter/ or similar
# Upload icon-source.svg, download PNG versions
```

### AI Insights Integration
Replace mock API call in fetchAIInsights() with real endpoint:

```javascript
// Example integration with your LLM provider
async function fetchAIInsights() {
  const response = await fetch('https://your-ai-api.com/insights', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      portfolio: state.portfolio,
      positions: state.positions[state.portfolio],
      market_context: await fetchMarketContext()
    })
  });
  return await response.json();
}
```

Prompt Engineering Tip: Include portfolio context, risk tolerance, and time horizon for personalized insights.

## 🧪 Testing
### WebSocket Server
```bash
# Health check
curl http://localhost:8080/health

# Test with wscat
npm install -g wscat
wscat -c ws://localhost:8080
> {"type":"subscribe","portfolio":"personal"}
```

### PWA
1. Open DevTools → Application → Manifest: Verify no errors
2. Application → Service Workers: Check "Update on reload" for testing
3. Lighthouse audit: Target score >90 for PWA

### Biometric Auth
* Test on Chrome (Android/Windows Hello) or Safari (iOS/macOS Face ID)
* Use WebAuthnHelper.isSupported() for feature detection

## � Deployment Options

Since GitHub Pages only supports static sites, deploy the full-stack app to a platform that supports Node.js:

### Railway (Recommended - Free tier available)
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and create project
railway login
railway init trading-trip

# 3. Deploy
railway up

# 4. Get domain
railway domain
```

### Render (Free tier, auto-deploys from Git)
```bash
# 1. Connect GitHub repo to Render
# 2. Create Web Service with:
#    - Runtime: Node
#    - Build Command: npm install
#    - Start Command: npm start
# 3. Environment: Add PORT variable (auto-set by Render)
```

### Heroku
```bash
# 1. Install Heroku CLI
# 2. Create app
heroku create trading-trip-dashboard

# 3. Deploy
git push heroku main

# 4. Open app
heroku open
```

### DigitalOcean App Platform
- Connect GitHub repo
- Set runtime to Node.js
- Configure build and run commands
- Auto-scaling and CDN included

### Manual VPS (Advanced)
```bash
# Ubuntu/Debian server
sudo apt update
sudo apt install nodejs npm
git clone <your-repo>
cd trading-trip
npm install
npm start

# Use PM2 for production
npm install -g pm2
pm2 start server.js --name trading-trip
pm2 startup
pm2 save
```

### Environment Variables
For production, set:
- `PORT`: Auto-set by most platforms
- `NODE_ENV`: production
- `WS_URL`: wss://your-domain.com (for frontend)

Update `index.html` line ~45:
```javascript
const WS_URL = process.env.NODE_ENV === 'production' 
  ? 'wss://your-domain.com' 
  : 'ws://localhost:8080';
```

## 📱 Responsive Behavior

| Breakpoint	| Layout	| Features |
|-------------|---------|----------|
| < 768px	| Mobile	| Bottom nav, collapsed portfolio toggle, PWA prompt |
| 768px - 1023px	| Tablet	| Hybrid layout, desktop nav visible |
| ≥ 1024px	| Desktop	| Full grid, all features visible |

## 🔄 Updating Dependencies
```bash
# Update CDN libraries (check versions first)
# Chart.js: https://cdn.jsdelivr.net/npm/chart.js@latest
# jsPDF: https://cdnjs.cloudflare.com/ajax/libs/jspdf/
# Tailwind: https://cdn.tailwindcss.com (JIT compiler)

# For production, consider build step:
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
# Then use @tailwind directives in CSS
```

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| WebSocket won't connect | Check browser console; ensure ws:// or wss:// matches server; verify CORS |
| PWA install prompt not showing | Must be HTTPS; user must interact with page first; check beforeinstallprompt event |
| Biometric auth fails | Check WebAuthnHelper.isSupported(); ensure HTTPS; verify backend challenge format |
| Charts not rendering | Ensure canvas has dimensions; call renderSparklines() after DOM update |
| Theme flicker on load | Set <html class="dark"> server-side based on user preference cookie |

## 📄 License
MIT © 2026 Trading-Trip. Use freely for personal or commercial projects.

💡 Pro Tip: For production, add a build step with Vite or esbuild to bundle/minify assets, tree-shake unused Chart.js components, and inject CSP nonces.

Ready to deploy? 🚀 Let me know if you need help with backend integration or CI/CD setup!