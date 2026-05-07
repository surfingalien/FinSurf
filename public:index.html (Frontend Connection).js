// WebSocket connection
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

// AI insights fetch
async function fetchAIInsights() {
  const response = await fetch('/api/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      portfolio: state.portfolio, 
      positions: state.positions[state.portfolio] 
    })
  });
  const data = await response.json();
  updateAIInsights(data.insights);
}