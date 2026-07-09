// content-kimi.js — ZENOME content script for Kimi
(function() {
  if (window.__zenome_kimi_loaded) return;
  window.__zenome_kimi_loaded = true;

  const PLATFORM_ID = "kimi";
  const POLL_INTERVAL_MS = 1000;
  const PRE_SEND_DELAY_MS = 400;
  const RESPONSE_TIMEOUT_MS = 120000;

  const SEL_INPUT_PRIMARY  = '[data-testid="chat-input"]';
  const SEL_INPUT_FALLBACK = '[contenteditable="true"]';
  const SEL_SEND_PRIMARY   = '.send-btn';
  const SEL_SEND_FALLBACK  = '[aria-label="Send"]';
  const SEL_STOP_BTN       = '.stop-btn, [aria-label="Stop"]';
  const SEL_RESPONSE       = '.chat-message.assistant:last-child .message-content';
  const SEL_RESPONSE_FB    = '[data-role="assistant"]';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function sendResponseReady(text, injectionId) {
    try {
      chrome.runtime.sendMessage(
        { action: "responseReady", platform: PLATFORM_ID, response: text, injectionId },
        () => { if (chrome.runtime.lastError) {} }
      );
    } catch (err) { console.error("ZENOME [kimi] sendResponseReady error:", err); }
  }

  // Injects a prompt into Kimi using DataTransfer paste (contenteditable).
  async function injectPrompt(promptText, injectionId) {
    try {
      const el = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
      if (!el) { console.error("ZENOME [kimi] input not found"); return; }
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', promptText);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
      await sleep(PRE_SEND_DELAY_MS);
      const sendBtn = document.querySelector(SEL_SEND_PRIMARY) || document.querySelector(SEL_SEND_FALLBACK);
      if (!sendBtn) { console.error("ZENOME [kimi] send button not found"); return; }
      sendBtn.click();
      const responseText = await waitForResponse();
      sendResponseReady(responseText, injectionId);
    } catch (err) { console.error("ZENOME [kimi] injectPrompt error:", err); }
  }

  // Polls for absence of stop button as completion signal.
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          try {
            const stopBtn = document.querySelector(SEL_STOP_BTN);
            if (!stopBtn || Date.now() >= deadline) {
              clearInterval(interval);
              const primary = document.querySelector(SEL_RESPONSE);
              if (primary) { resolve(primary.innerText.trim()); return; }
              const all = document.querySelectorAll(SEL_RESPONSE_FB);
              resolve(all && all.length > 0 ? all[all.length - 1].innerText.trim() : "");
            }
          } catch (err) { clearInterval(interval); resolve(""); }
        }, POLL_INTERVAL_MS);
      }, PRE_SEND_DELAY_MS * 3);
    });
  }

  function diagnose() {
    const inputEl = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
    const sendBtn = document.querySelector(SEL_SEND_PRIMARY)  || document.querySelector(SEL_SEND_FALLBACK);
    const stopBtn = document.querySelector(SEL_STOP_BTN);
    return {
      inputVisible: !!inputEl, sendBtnDisabled: sendBtn ? sendBtn.disabled : true,
      hasPartialResponse: !!stopBtn, url: location.href
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
