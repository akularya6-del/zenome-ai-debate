// content-gemini.js — ZENOME content script for Gemini
(function() {
  if (window.__zenome_gemini_loaded) return;
  window.__zenome_gemini_loaded = true;

  const PLATFORM_ID = "gemini";
  const POLL_INTERVAL_MS = 800;
  const PRE_SEND_DELAY_MS = 300;
  const RESPONSE_TIMEOUT_MS = 90000;

  const SEL_INPUT_PRIMARY   = '.ql-editor';
  const SEL_INPUT_FALLBACK  = '[contenteditable="true"]';
  const SEL_SEND_PRIMARY    = 'button[aria-label="Send message"]';
  const SEL_SEND_FALLBACK   = 'button.send-button';
  const SEL_LOADING         = '.loading-indicator, [aria-label*="loading"]';
  const SEL_RESPONSE        = 'model-response .markdown.markdown-main-panel';
  const SEL_RESPONSE_FB     = '[data-role="model"]';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function sendResponseReady(text, injectionId) {
    try {
      chrome.runtime.sendMessage(
        { action: "responseReady", platform: PLATFORM_ID, response: text, injectionId },
        () => { if (chrome.runtime.lastError) {} }
      );
    } catch (err) { console.error("ZENOME [gemini] sendResponseReady error:", err); }
  }

  // Injects a prompt into Gemini's editor using the DataTransfer paste approach.
  async function injectPrompt(promptText, injectionId) {
    try {
      const el = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
      if (!el) { console.error("ZENOME [gemini] input not found"); return; }
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', promptText);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
      await sleep(PRE_SEND_DELAY_MS);
      const sendBtn = document.querySelector(SEL_SEND_PRIMARY) || document.querySelector(SEL_SEND_FALLBACK);
      if (!sendBtn) { console.error("ZENOME [gemini] send button not found"); return; }
      sendBtn.click();
      const responseText = await waitForResponse();
      sendResponseReady(responseText, injectionId);
    } catch (err) { console.error("ZENOME [gemini] injectPrompt error:", err); }
  }

  // Polls for absence of loading spinner, then scrapes the last model response.
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          try {
            const isLoading = !!document.querySelector(SEL_LOADING);
            if (!isLoading || Date.now() >= deadline) {
              clearInterval(interval);
              const p = document.querySelectorAll(SEL_RESPONSE);
              if (p && p.length > 0) { resolve(p[p.length - 1].innerText.trim()); return; }
              const f = document.querySelectorAll(SEL_RESPONSE_FB);
              resolve(f && f.length > 0 ? f[f.length - 1].innerText.trim() : "");
            }
          } catch (err) { clearInterval(interval); resolve(""); }
        }, POLL_INTERVAL_MS);
      }, PRE_SEND_DELAY_MS * 2);
    });
  }

  // Returns a diagnostic snapshot of the current page state.
  function diagnose() {
    const inputEl = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
    const sendBtn = document.querySelector(SEL_SEND_PRIMARY) || document.querySelector(SEL_SEND_FALLBACK);
    const responses = document.querySelectorAll(SEL_RESPONSE);
    return {
      inputVisible: !!inputEl, sendBtnDisabled: sendBtn ? sendBtn.disabled : true,
      hasPartialResponse: responses && responses.length > 0, url: location.href
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
