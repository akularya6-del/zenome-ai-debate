# ZENOME — Agent Rules

## Project Identity
ZENOME is a Chrome Extension (Manifest V3) that orchestrates multi-model AI debates 
across free browser tabs. No APIs. No backend. Browser sessions only.

## Tech Stack
- Pure JavaScript (no TypeScript, no build tools, no npm)
- Chrome Extension Manifest V3
- HTML + CSS for Dashboard UI (no React, no Tailwind — vanilla only)
- chrome.* APIs: tabs, scripting, storage, cookies, runtime

## Architecture
- background.js — Service Worker (state machine, tab coordinator)
- dashboard.html + dashboard.js — Full-tab UI
- content-[platform].js — Per-platform injection + scraping scripts
- content-headai.js — Head AI orchestrator content script
- manifest.json — MV3 config

## Non-Negotiables
- NEVER suggest API keys, fetch calls to AI APIs, or backend servers
- NEVER use npm, webpack, babel, or any build tool
- NEVER use TypeScript — plain .js files only
- NEVER use document.write()
- ALWAYS use chrome.storage.session for debate state (NOT localStorage)
- ALWAYS use MutationObserver for response completion detection
- ALWAYS handle chrome.runtime.lastError in every chrome API callback
- Content scripts must use the nativeInputValueSetter pattern for React-based inputs
- Service Worker must write state to chrome.storage.session after EVERY state change

## File Structure
zenome/
├── manifest.json
├── background.js
├── dashboard.html
├── dashboard.js
├── dashboard.css
├── content-chatgpt.js
├── content-gemini.js
├── content-perplexity.js
├── content-deepseek.js
├── content-kimi.js
├── content-qwen.js
├── content-grok.js
├── content-headai.js
├── utils/
│   ├── state.js        (chrome.storage.session read/write helpers)
│   ├── normalizer.js   (response text cleanup)
│   └── format-infer.js (output format detection from task text)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png

## Code Quality
- Every function must have a single-line comment stating its purpose
- No function longer than 40 lines — break into helpers
- No magic numbers — use named constants at top of each file
- All setTimeout values must be named constants (e.g. INJECT_DELAY_MS = 4000)
- Every chrome API call wrapped in try/catch or checks chrome.runtime.lastError
