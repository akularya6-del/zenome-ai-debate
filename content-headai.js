// content-headai.js — ZENOME Head AI Orchestrator
(function() {
  if (window.__zenome_headai_loaded) return;
  window.__zenome_headai_loaded = true;

  const PLATFORM_ID = "headai";
  const PRE_SEND_DELAY_MS = 500;
  const RESPONSE_TIMEOUT_MS = 90000;
  const POLL_INTERVAL_MS = 800;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  const PLATFORM_STRATEGIES = {
    'chat.openai.com': { inject: injectChatGPT, scrape: scrapeChatGPT, isComplete: isCompleteChatGPT },
    'gemini.google.com': { inject: injectGemini, scrape: scrapeGemini, isComplete: isCompleteGemini },
    'www.perplexity.ai': { inject: injectPerplexity, scrape: scrapePerplexity, isComplete: isCompletePerplexity },
    'chat.deepseek.com': { inject: injectDeepSeek, scrape: scrapeDeepSeek, isComplete: isCompleteDeepSeek },
    'www.kimi.com': { inject: injectKimi, scrape: scrapeKimi, isComplete: isCompleteKimi },
    'chat.qwen.ai': { inject: injectQwen, scrape: scrapeQwen, isComplete: isCompleteQwen },
    'grok.com': { inject: injectGrok, scrape: scrapeGrok, isComplete: isCompleteGrok }
  };

  // --- CHATGPT ---
  async function injectChatGPT(p) {
    const el = document.querySelector('#prompt-textarea');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, p);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(PRE_SEND_DELAY_MS);
    const btn = document.querySelector('[data-testid="send-button"]');
    if (btn) btn.click();
    return true;
  }
  function isCompleteChatGPT() { const b = document.querySelector('[data-testid="send-button"]'); return b && !b.disabled; }
  function scrapeChatGPT() { const m = document.querySelectorAll('[data-message-author-role="assistant"]'); return m && m.length > 0 ? m[m.length-1].innerText.trim() : ""; }

  // --- GEMINI ---
  async function injectGemini(p) {
    const el = document.querySelector('.ql-editor') || document.querySelector('[contenteditable="true"]');
    if (!el) return false;
    el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', p);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    await sleep(300);
    const btn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('button.send-button');
    if (btn) btn.click();
    return true;
  }
  function isCompleteGemini() { return !document.querySelector('.loading-indicator, [aria-label*="loading"]'); }
  function scrapeGemini() { const p = document.querySelectorAll('model-response .markdown.markdown-main-panel'); if (p && p.length>0) return p[p.length-1].innerText.trim(); const f = document.querySelectorAll('[data-role="model"]'); return f && f.length>0 ? f[f.length-1].innerText.trim() : ""; }

  // --- PERPLEXITY ---
  async function injectPerplexity(p) {
    const el = document.querySelector('textarea[placeholder*="Ask"]') || document.querySelector('textarea');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, p);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1000);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    return true;
  }
  function isCompletePerplexity() { return !!document.querySelector('[aria-label="Copy"]'); }
  function scrapePerplexity() { const el = document.querySelector('.prose') || document.querySelector('[class*="prose"]'); return el ? el.innerText.replace(/\[\d+\]/g, '').trim() : ""; }

  // --- DEEPSEEK ---
  async function injectDeepSeek(p) {
    const el = document.querySelector('#chat-input') || document.querySelector('textarea[class*="chat"]');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, p);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(400);
    const btn = document.querySelector('.send-button') || document.querySelector('button[type="submit"]');
    if (btn) btn.click();
    return true;
  }
  function isCompleteDeepSeek() { return !!(document.querySelector('[aria-label*="Regenerate"]') || document.querySelector('.regenerate-btn')); }
  function scrapeDeepSeek() { const s = (t) => t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); const p = document.querySelector('.ds-markdown:last-of-type'); if (p) return s(p.innerText); const a = document.querySelectorAll('.message-content'); return a && a.length>0 ? s(a[a.length-1].innerText) : ""; }

  // --- KIMI ---
  async function injectKimi(p) {
    const el = document.querySelector('[data-testid="chat-input"]') || document.querySelector('[contenteditable="true"]');
    if (!el) return false;
    el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', p);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    await sleep(400);
    const btn = document.querySelector('.send-btn') || document.querySelector('[aria-label="Send"]');
    if (btn) btn.click();
    return true;
  }
  function isCompleteKimi() { return !document.querySelector('.stop-btn, [aria-label="Stop"]'); }
  function scrapeKimi() { const p = document.querySelector('.chat-message.assistant:last-child .message-content'); if (p) return p.innerText.trim(); const a = document.querySelectorAll('[data-role="assistant"]'); return a && a.length>0 ? a[a.length-1].innerText.trim() : ""; }

  // --- QWEN ---
  async function injectQwen(p) {
    const el = document.querySelector('textarea.ant-input') || document.querySelector('textarea[class*="input"]');
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, p);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1000);
    const btn = document.querySelector('.send-btn');
    if (btn) btn.click(); else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    return true;
  }
  function isCompleteQwen() { return !document.querySelector('.loading, .typing-indicator'); }
  function scrapeQwen() { const a = document.querySelectorAll('.message.assistant .markdown-body'); return a && a.length>0 ? a[a.length-1].innerText.trim() : ""; }

  // --- GROK ---
  async function injectGrok(p) {
    const el = document.querySelector('[contenteditable="true"]') || document.querySelector('.message-input');
    if (!el) return false;
    el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, p);
    await sleep(400);
    const btn = document.querySelector('button[aria-label*="Send"]') || document.querySelector('button[type="submit"]');
    if (btn) btn.click();
    return true;
  }
  function isCompleteGrok() { return !!document.querySelector('.message-actions, .response-actions'); }
  function scrapeGrok() { const p = document.querySelector('.response-message:last-child'); if (p) return p.innerText.trim(); const a = document.querySelectorAll('[data-role="assistant"]'); return a && a.length>0 ? a[a.length-1].innerText.trim() : ""; }

  // --- HEAD AI ORCHESTRATOR LOGIC ---
  function getStrategy() {
    const host = window.location.hostname;
    for (const [domain, strategy] of Object.entries(PLATFORM_STRATEGIES)) {
      if (host.includes(domain)) return strategy;
    }
    return null;
  }

  // Parses raw Head AI response text into JSON with fallback extraction.
  function parseHeadAIResponse(rawText) {
    let c = (rawText || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try { return { success: true, data: JSON.parse(c), rawText }; } catch (e) {}
    const f = c.indexOf("{"), l = c.lastIndexOf("}");
    if (f !== -1 && l > f) { try { return { success: true, data: JSON.parse(c.substring(f, l+1)), rawText }; } catch (e2) {} }
    return { success: false, data: null, rawText };
  }

  // Handles injecting a prompt and polling for the response.
  async function handleHeadAIInjection(prompt, injectionId, isSynthesis) {
    const strategy = getStrategy();
    if (!strategy) return;
    const injected = await strategy.inject(prompt);
    if (!injected) return;
    const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
    await sleep(1000);
    const interval = setInterval(async () => {
      if (strategy.isComplete() || Date.now() > deadline) {
        clearInterval(interval);
        await sleep(500);
        const rawText = strategy.scrape();
        const result = parseHeadAIResponse(rawText);
        const actionName = isSynthesis ? "headAISynthesisReady" : "headAIResponseReady";
        try { chrome.runtime.sendMessage({ action: actionName, parsed: result.success, data: result.data, rawText: result.rawText, injectionId }); } catch (err) {}
      }
    }, POLL_INTERVAL_MS);
  }

  // Routes incoming commands from the service worker.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "injectHeadAI") {
      handleHeadAIInjection(msg.prompt, msg.injectionId, false);
      sendResponse({ status: "injecting_headai" });
    } else if (msg.action === "injectHeadAISynthesis") {
      handleHeadAIInjection(msg.prompt, msg.injectionId, true);
      sendResponse({ status: "injecting_synthesis" });
    } else if (msg.action === "diagnoseHeadAI") {
      sendResponse({ active: true, strategy: !!getStrategy() });
    }
    return true;
  });
})();
