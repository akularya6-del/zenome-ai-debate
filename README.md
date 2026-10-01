<div align="center">

# zenome

**Chrome Extension that orchestrates live multi-model AI debates across browser tabs — no API keys, no backend, uses your live AI sessions.**

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285f4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![No API Keys](https://img.shields.io/badge/API_Keys-None_Required-success?style=flat-square)

</div>

---

## Overview

Zenome turns your open browser tabs into a debate chamber. It injects prompts into ChatGPT, Gemini, DeepSeek, Grok, Kimi, Qwen, and Perplexity simultaneously, collects their responses, and surfaces the results in a unified dashboard — all without a single API key or backend server.

Built entirely in vanilla JavaScript with zero build tools or npm dependencies.

## How It Works

1. You type a question in the Zenome dashboard
2. A service worker opens/reuses a tab for each AI model
3. Content scripts inject your prompt into each AI's native chat interface
4. Responses are scraped and sent back to the service worker
5. The dashboard displays all responses side-by-side for comparison

## Supported Models

| Model | Platform |
|---|---|
| ChatGPT | chat.openai.com |
| Gemini | gemini.google.com |
| DeepSeek | chat.deepseek.com |
| Grok | grok.com |
| Kimi | kimi.moonshot.cn |
| Qwen | qwen.aliyun.com |
| Perplexity | perplexity.ai |

## Installation

1. Download or clone this repo
2. Open Chrome → go to `chrome://extensions/`
3. Toggle **Developer mode** ON (top-right)
4. Click **Load unpacked** → select the `zenome/` folder
5. Pin the extension — click the puzzle piece icon, then pin Zenome

## Features

- **Zero API keys** — Uses your existing logged-in sessions
- **No backend** — Pure Chrome Extension, everything runs in your browser
- **Simultaneous injection** — All models receive the same prompt at the same time
- **Unified dashboard** — Full-tab HTML + CSS dashboard for comparing responses
- **Per-model content scripts** — Isolated injection scripts per platform for stability
- **Vanilla JS** — No TypeScript, no build step, no npm — load and go

## Architecture

```
background.js              # Service worker — state machine, tab coordinator
dashboard.html / .js / .css  # Full-tab comparison UI
content-chatgpt.js         # ChatGPT injection + response scraping
content-gemini.js          # Gemini injection + response scraping
content-deepseek.js        # DeepSeek injection + response scraping
content-grok.js            # Grok injection + response scraping
content-kimi.js            # Kimi injection + response scraping
content-qwen.js            # Qwen injection + response scraping
content-perplexity.js      # Perplexity injection + response scraping
content-headai.js          # Head AI orchestrator
manifest.json              # MV3 config
```

## Features

- chrome-extension
- ai
- multi-model
- manifest-v3
- javascript
- chatgpt
- gemini

## Getting Started

Clone the repo and follow the setup instructions in the code.
