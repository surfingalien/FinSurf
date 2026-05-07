// Chart management
- Charts destroyed before re-render to prevent memory leaks
- Debounced resize handler (150ms)
- Lazy initialization after DOMContentLoaded

// Theme switching
- CSS variables = zero JS reflows
- localStorage check on load (no flash)
- Transition properties optimized for GPU

// Export
- PDF generation happens client-side (no server dependency)
- CSV uses Blob API for efficient memory handling