// content-perplexity.js — ZENOME content script for Perplexity
(function() {
  if (window.__zenome_perplexity_loaded) return;
  window.__zenome_perplexity_loaded = true;

  const PLATFORM_ID = "perplexity";
  const POLL_INTERVAL_MS = 800;
  const PRE_SEND_DELAY_MS = 1000;
  const RESPONSE_TIMEOUT_MS = 90000;

  const SEL_INPUT_PRIMARY  = 'textarea[placeholder*="Ask"]';
  const SEL_INPUT_FALLBACK = 'textarea';
  const SEL_COPY_BTN       = '[aria-label="Copy"]';
  const SEL_RESPONSE       = '.prose';
  const SEL_RESPONSE_FB    = '[class*="prose"]';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function sendResponseReady(text, injectionId) {
    try {
      chrome.runtime.sendMessage(
        { action: "responseReady", platform: PLATFORM_ID, response: text, injectionId },
        () => { if (chrome.runtime.lastError) {} }
      );
    } catch (err) { console.error("ZENOME [perplexity] sendResponseReady error:", err); }
  }

  // Injects a prompt into Perplexity's textarea and submits via Enter keydown.
  async function injectPrompt(promptText, injectionId) {
    try {
      const el = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
      if (!el) { console.error("ZENOME [perplexity] textarea not found"); return; }
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(el, promptText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(PRE_SEND_DELAY_MS);
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      const responseText = await waitForResponse();
      sendResponseReady(responseText, injectionId);
    } catch (err) { console.error("ZENOME [perplexity] injectPrompt error:", err); }
  }

  // Polls for the appearance of the copy button as a completion signal.
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          try {
            const copyBtn = document.querySelector(SEL_COPY_BTN);
            if (copyBtn || Date.now() >= deadline) {
              clearInterval(interval);
              const el = document.querySelector(SEL_RESPONSE) || document.querySelector(SEL_RESPONSE_FB);
              resolve(el ? el.innerText.replace(/\[\d+\]/g, '').trim() : "");
            }
          } catch (err) { clearInterval(interval); resolve(""); }
        }, POLL_INTERVAL_MS);
      }, PRE_SEND_DELAY_MS);
    });
  }

  function diagnose() {
    const inputEl = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
    const copyBtn = document.querySelector(SEL_COPY_BTN);
    const response = document.querySelector(SEL_RESPONSE) || document.querySelector(SEL_RESPONSE_FB);
    return {
      inputVisible: !!inputEl, sendBtnDisabled: false,
      hasPartialResponse: !!response, url: location.href
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "inject") {
      injectPrompt(msg.prompt, msg.injectionId);
      sendResponse({ status: "injecting", platform: PLATFORM_ID });
    } else if (msg.action === "diagnose") { sendResponse(diagnose()); }
    else { sendResponse({ status: "unknown_action" }); }
    return true;
  });
})();
