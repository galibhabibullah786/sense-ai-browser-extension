# SenseAI Browser Extension

AI-powered website trust analysis extension for Chrome/Chromium browsers.

## Features

- **Real-time Trust Analysis**: Analyze any website's security and privacy signals
- **Trust Score Gauge**: Visual representation of website trustworthiness (0-100)
- **Signal Breakdown**: Detailed breakdown of SSL, headers, cookies, trackers, and fingerprinting
- **AI Explanations**: Natural language explanations of security analysis
- **Dark/Light Mode**: Matches your system preference or manual toggle
- **Offline Support**: Caches results for quick access

## Architecture

```
sense-ai-extension/
├── manifest.json          # Chrome Extension manifest v3
├── popup.html             # Popup entry point
├── src/
│   ├── background/        # Service worker (handles analysis, caching, WebSocket)
│   │   ├── index.ts       # Main background script
│   │   └── simulation.ts  # Simulated backend responses
│   ├── content/           # Content scripts (signal collection)
│   │   └── index.ts       # Collects cookies, trackers, fingerprinting, etc.
│   ├── popup/             # React popup UI
│   │   ├── App.tsx        # Main popup component
│   │   ├── main.tsx       # React entry point
│   │   ├── index.css      # Tailwind + theme CSS
│   │   └── components/    # Reusable UI components
│   ├── types/             # TypeScript definitions
│   └── lib/               # Utility functions
```

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
cd sense-ai-extension
pnpm install
```

### Build

```bash
# Development build (with source maps)
pnpm dev

# Production build
pnpm build

# Watch mode for development
pnpm build:watch
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist` folder from this project

### Development Mode

The extension is currently running in **simulation mode** since the backend is not implemented yet. This means:

- Trust scores are simulated based on heuristics
- Known trusted domains (Google, GitHub, etc.) get higher scores
- Suspicious patterns in URLs/domains lower the score
- AI explanations are generated locally

## Backend Integration (TODO)

When the backend is ready, uncomment the WebSocket code in `src/background/index.ts`:

1. Uncomment the Socket.io imports and connection code
2. Update `BACKEND_URL` to point to your backend
3. The extension will automatically:
   - Establish WebSocket connection on startup
   - Send collected signals to backend for analysis
   - Receive trust scores and AI explanations in real-time
   - Queue signals when offline and retry on reconnection

## Theme

The extension uses the same design system as the main SenseAI web app:

- **Primary Color**: Teal/Cyan (`hsl(173, 80%, 40%)`)
- **Trust Safe**: Green (`hsl(152, 76%, 40%)`)
- **Trust Warning**: Orange (`hsl(38, 92%, 50%)`)
- **Trust Danger**: Red (`hsl(0, 84%, 60%)`)

Both light and dark modes are supported.

## Permissions

The extension requires these permissions:

- `activeTab` - Access current tab for analysis
- `storage` - Cache results and settings
- `cookies` - Read cookie information
- `webRequest` - Detect trackers and redirects
- `scripting` - Inject content scripts
- `tabs` - Get tab URL information

## License

Private - Part of SenseAI project
