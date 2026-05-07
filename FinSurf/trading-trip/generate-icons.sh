#!/bin/bash
# generate-icons.sh - Generate PWA icons from SVG source

SOURCE="icons/icon-source.svg"
OUTPUT_DIR="icons"

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick not found. Install with: brew install imagemagick"
    echo "📝 Manual steps:"
    echo "1. Open icons/icon-source.svg in a browser or image editor"
    echo "2. Export as PNG at 192x192 and 512x512"
    echo "3. Save as icons/icon-192.png and icons/icon-512.png"
    exit 1
fi

echo "🎨 Generating PWA icons..."

# Generate 192x192 icon
convert "$SOURCE" -resize 192x192 -background "#030304" -gravity center -extent 192x192 "$OUTPUT_DIR/icon-192.png"

# Generate 512x512 icon
convert "$SOURCE" -resize 512x512 -background "#030304" -gravity center -extent 512x512 "$OUTPUT_DIR/icon-512.png"

# Generate maskable versions (with padding)
convert "$SOURCE" -resize 153x153 -background "#030304" -gravity center -extent 192x192 "$OUTPUT_DIR/icon-192-maskable.png"
convert "$SOURCE" -resize 409x409 -background "#030304" -gravity center -extent 512x512 "$OUTPUT_DIR/icon-512-maskable.png"

echo "✅ Icons generated in $OUTPUT_DIR/"
echo "📱 Test PWA: Open index.html in browser, check DevTools → Application → Manifest"