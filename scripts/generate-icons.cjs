// Run this script with Node.js to generate icon files
// node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// SVG icon template - a shield with a checkmark
const generateSvg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#14b8a6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d9488;stop-opacity:1" />
    </linearGradient>
  </defs>
  <path 
    d="M${size/2} ${size*0.05}L${size*0.9} ${size*0.2}V${size*0.5}C${size*0.9} ${size*0.75} ${size*0.7} ${size*0.9} ${size/2} ${size*0.95}C${size*0.3} ${size*0.9} ${size*0.1} ${size*0.75} ${size*0.1} ${size*0.5}V${size*0.2}L${size/2} ${size*0.05}Z" 
    fill="url(#gradient)"
  />
  <path 
    d="M${size*0.35} ${size*0.5}L${size*0.45} ${size*0.6}L${size*0.65} ${size*0.4}" 
    stroke="white" 
    stroke-width="${size*0.08}" 
    stroke-linecap="round" 
    stroke-linejoin="round"
    fill="none"
  />
</svg>`;

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// Ensure directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG icons (you'll need to convert to PNG for production)
sizes.forEach(size => {
  const svg = generateSvg(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Generated ${filename}`);
});

console.log('\nSVG icons generated successfully in the public/icons directory.');
console.log('After building your extension, copy these icons to the build output directory as well.')
console.log('\nNote: For production, convert SVG files to PNG format.');
console.log('You can use tools like:');
console.log('  - sharp (npm package)');
console.log('  - ImageMagick: convert icon.svg icon.png');
console.log('  - Online converters');
