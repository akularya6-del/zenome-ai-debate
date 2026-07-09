// content-deepseek.js — ZENOME content script for DeepSeek
(function() {
  if (window.__zenome_deepseek_loaded) return;
  window.__zenome_deepseek_loaded = true;

  const PLATFORM_ID = "deepseek";
  const POLL_INTERVAL_MS = 800;
  const PRE_SEND_DELAY_MS = 400;
  const RESPONSE_TIMEOUT_MS = 90000;

  const SEL_INPUT_PRIMARY    = '#chat-input';
  const SEL_INPUT_FALLBACK   = 'textarea[class*="chat"]';
  const SEL_SEND_PRIMARY     = '.send-button';
  const SEL_SEND_FALLBACK    = 'button[type="submit"]';
  const SEL_REGEN_PRIMARY    = '[aria-label*="Regenerate"]';
  const SEL_REGEN_FALLBACK   = '.regenerate-btn';
  const SEL_RESPONSE_PRIMARY = '.ds-markdown:last-of-type';
  const SEL_RESPONSE_FALLBACK = '.message-content';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function sendResponseReady(text, injectionId) {
    try {
      chrome.runtime.sendMessage(
        { action: "responseReady", platform: PLATFORM_ID, response: text, injectionId },
        () => { if (chrome.runtime.lastError) {} }
      );
    } catch (err) { console.error("ZENOME [deepseek] sendResponseReady error:", err); }
  }

  // Strips <think>...</think> blocks from DeepSeek R1 responses.
  function stripThinkBlocks(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  // Injects a prompt using nativeInputValueSetter and clicks send.
  async function injectPrompt(promptText, injectionId) {
    try {
      const el = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
      if (!el) { console.error("ZENOME [deepseek] input not found"); return; }
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(el, promptText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(PRE_SEND_DELAY_MS);
      const sendBtn = document.querySelector(SEL_SEND_PRIMARY) || document.querySelector(SEL_SEND_FALLBACK);
      if (!sendBtn) { console.error("ZENOME [deepseek] send button not found"); return; }
      sendBtn.click();
      const responseText = await waitForResponse();
      sendResponseReady(responseText, injectionId);
    } catch (err) { console.error("ZENOME [deepseek] injectPrompt error:", err); }
  }

  // Polls for regenerate button as completion signal, then scrapes last response.
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          try {
            const regenBtn = document.querySelector(SEL_REGEN_PRIMARY) || document.querySelector(SEL_REGEN_FALLBACK);
            if (regenBtn || Date.now() >= deadline) {
              clearInterval(interval);
              const primary = document.querySelector(SEL_RESPONSE_PRIMARY);
              if (primary) { resolve(stripThinkBlocks(primary.innerText.trim())); return; }
              const all = document.querySelectorAll(SEL_RESPONSE_FALLBACK);
              resolve(all && all.length > 0 ? stripThinkBlocks(all[all.length - 1].innerText.trim()) : "");
            }
          } catch (err) { clearInterval(interval); resolve(""); }
        }, POLL_INTERVAL_MS);
      }, PRE_SEND_DELAY_MS);
    });
  }

  function diagnose() {
    const inputEl  = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
    const sendBtn  = document.querySelector(SEL_SEND_PRIMARY)  || document.querySelector(SEL_SEND_FALLBACK);
    const regenBtn = document.querySelector(SEL_REGEN_PRIMARY) || document.querySelector(SEL_REGEN_FALLBACK);
    return {
      inputVisible: !!inputEl, sendBtnDisabled: sendBtn ? sendBtn.disabled : true,
      hasPartialResponse: !!regenBtn, url: location.href
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
