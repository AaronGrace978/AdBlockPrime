# AdBlockPrime

AI-powered, stealth ad blocker for Chrome, Firefox, Edge, and other Chromium-based browsers.

## Features

### AI Heuristic Engine
- Scores DOM elements using 12+ signal categories (class patterns, ID patterns, size fingerprints, attribute analysis, parent chain inspection, iframe detection, etc.)
- Configurable scoring threshold with weighted signals
- Adaptive learning store that tracks detection accuracy per domain

### Stealth Mode (Anti-Detection)
- Intercepts anti-adblock detection scripts before they execute
- Spoofs ad element properties (`offsetHeight`, `offsetWidth`, `getBoundingClientRect`, `getComputedStyle`)
- Creates invisible fake ad elements to satisfy detection checks
- Neutralizes `setTimeout`/`setInterval`-based ad block detectors
- Spoofs global variables (`canRunAds`, `adsbygoogle`, etc.)
- Intercepts XHR/Fetch requests to ad-detection endpoints
- Removes anti-adblock overlays and modals automatically
- Restores scroll when sites lock it after detecting blockers

### Network-Level Blocking
- **Chrome**: Uses Manifest V3 `declarativeNetRequest` API for native-speed blocking
- **Firefox**: Uses `webRequest` API with blocking for real-time request interception
- 80+ ad/tracking domains blocked at the network level
- Dynamic rule generation from AI network analyzer

### Cosmetic Filtering
- 40+ generic CSS selectors targeting common ad patterns
- Automatic layout fixing after ad removal (collapses empty spaces)
- Cookie consent and newsletter popup blocking
- Custom CSS rule injection

### Element Picker
- Visual element picker tool (activated from popup)
- Click any element to permanently block it
- Generates optimized CSS selectors
- Custom rules persist across sessions

### Tracking Protection
- Strips UTM parameters and click IDs from URLs
- Blocks tracking pixels and beacons
- Prevents fingerprinting attempts

## Installation

### Chrome / Edge / Brave (Chromium)

**Option 1: Load directly from source**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `G:\AdBlockPrime` folder (root folder with `manifest.json`)

**Option 2: Build first**
```bash
node build.js chrome
```
Then load `dist/chrome/` as unpacked extension.

### Firefox
```bash
node build.js firefox
```
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/firefox/manifest.json`

## Project Structure

```
AdBlockPrime/
├── manifest.json              # Chrome MV3 manifest
├── manifest.firefox.json      # Firefox MV2 manifest
├── build.js                   # Build script for Chrome/Firefox
├── package.json
├── src/
│   ├── ai/
│   │   ├── engine.js          # AI heuristic scoring engine
│   │   └── network-analyzer.js # Network request analysis
│   ├── background/
│   │   ├── service-worker.js       # Chrome background worker
│   │   └── service-worker-firefox.js # Firefox background script
│   ├── content/
│   │   ├── stealth.js         # Anti-detection / stealth module
│   │   ├── element-detector.js # DOM scanning and ad hiding
│   │   ├── cosmetic-filter.js # CSS-based cosmetic filtering
│   │   ├── content-script.js  # Chrome content script entry
│   │   └── content-script-firefox.js # Firefox content script entry
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   ├── popup.css          # Popup styles (dark theme)
│   │   └── popup.js           # Popup logic
│   ├── options/
│   │   ├── options.html       # Full settings page
│   │   ├── options.css        # Options styles
│   │   └── options.js         # Options logic
│   └── rules/
│       └── network-rules.json # declarativeNetRequest rules
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── dist/
    ├── chrome/                # Chrome build output
    └── firefox/               # Firefox build output
```

## How the AI Engine Works

The engine analyzes every DOM element using a weighted scoring system:

| Signal | Weight | Description |
|--------|--------|-------------|
| Class patterns | 30 | Matches against 30+ ad-related class name regex patterns |
| ID patterns | 25 | Matches against ad-related element ID patterns |
| Source URLs | 40 | Checks `src` against known ad network domains |
| Standard ad sizes | 20 | Detects IAB standard ad dimensions (728x90, 300x250, etc.) |
| Data attributes | 35 | Checks for ad-specific data attributes |
| Iframe bonus | 15 | Additional weight for iframe elements |
| Tracking signals | 25 | Detects tracking-related patterns |
| Z-index/position | 10 | Detects fixed/sticky overlay ads |
| Parent chain | 15 | Checks parent elements for ad context |

An element with a combined score >= 45 (threshold) is classified as an ad and hidden.

## Build Commands

```bash
# Build for Chrome
node build.js chrome

# Build for Firefox
node build.js firefox

# Build for both
npm run build:all
```

## Configuration

All settings are accessible from:
- **Popup**: Click the extension icon for quick controls
- **Options page**: Right-click icon > Options for full settings

### Available Settings
- **Enable/Disable**: Master toggle
- **Stealth Mode**: Anti-adblock bypass
- **Network Filtering**: Block ad requests
- **Cosmetic Filtering**: Hide ad elements
- **Tracking Protection**: Strip tracking params
- **Aggressive Mode**: More aggressive blocking
- **Whitelist**: Per-site disable
- **Custom Filters**: Add CSS selectors
- **Badge Count**: Show blocked count on icon

## License

MIT
