# ZENOME Debugging Guide

Because ZENOME relies entirely on browser tab manipulation and DOM scraping, things can occasionally break if the underlying platforms update their UIs. This guide will help you debug issues.

## 1. Accessing the Service Worker DevTools

The `background.js` service worker is the brain of the orchestrator. If a debate hangs or fails, start here:
1. Go to `chrome://extensions`.
2. Find the ZENOME extension card.
3. Click the blue **"service worker"** link next to "Inspect views". This opens the dedicated DevTools for the background script.

## 2. Checking the State Machine

ZENOME stores its entire orchestration state in `chrome.storage.session`. You can inspect this live!
In the Service Worker DevTools Console, run:
```javascript
chrome.storage.session.get(null, console.log)
```
Look inside the `zenome_state` object.
- Is `status` stuck in `"round_in_progress"` or `"head_ai_processing"`?
- Look at `tabRegistry.models` — which models are `"processing"` vs `"timed_out"` vs `"done"`? This tells you which platform failed to respond.
- Check `error` for any logged fatal errors.

## 3. What to Check When a Debate Fails

If a specific model consistently fails to answer or times out:
1. Open a regular tab to that platform (e.g. `https://chat.openai.com`).
2. Right-click and **Inspect** to open DevTools on the platform itself.
3. Check the console for any errors injected by the ZENOME content scripts (tagged with `ZENOME [<platform>]`).
4. **The most common issue is a broken CSS Selector**. The platform may have updated their UI!

## 4. Common Errors & Fixes

| Issue | Root Cause | How to Fix |
|---|---|---|
| **"element not found"** logged in content script | The platform updated their HTML structure. | Update the `SEL_INPUT`, `SEL_SEND`, or `SEL_RESPONSE` constants at the top of the relevant `content-[platform].js` file. |
| **Model times out (90s)** | The completion signal (e.g. stop button disappearing, copy button appearing) failed to trigger. | Update the completion signal selectors in `waitForResponse()` in the relevant content script. |
| **Login check shows Red (but you are logged in)** | The platform changed its session cookie name. | Update the `LOGIN_COOKIES` map in `background.js` (Lines 42-48). |
| **Head AI JSON Parse Failed** | The Head AI returned a format that couldn't be parsed, even on retry. | The orchestration prompt may need to be adjusted in `background.js` (`buildHeadAIRound1Prompt` / `buildHeadAICrossDebatePrompt`) to force stricter JSON constraints. |
