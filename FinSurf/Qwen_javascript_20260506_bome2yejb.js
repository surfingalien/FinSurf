// Replace simulated data with API call:
async function fetchPositions() {
    const res = await fetch('/api/positions');
    const data = await res.json();
    // Update table rows and sparklineData
    // Call renderSparklines()
}