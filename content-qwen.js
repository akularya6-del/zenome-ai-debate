// content-qwen.js — ZENOME content script for Qwen
(function() {
  if (window.__zenome_qwen_loaded) return;
  window.__zenome_qwen_loaded = true;

  const PLATFORM_ID = "qwen";
  const POLL_INTERVAL_MS = 800;
  const PRE_SEND_DELAY_MS = 1000;
  const RESPONSE_TIMEOUT_MS = 90000;

  const SEL_INPUT_PRIMARY  = 'textarea.ant-input';
  const SEL_INPUT_FALLBACK = 'textarea[class*="input"]';
  const SEL_SEND_BTN       = '.send-btn';
  const SEL_LOADING        = '.loading, .typing-indicator';
  const SEL_RESPONSE       = '.message.assistant .markdown-body';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function sendResponseReady(text, injectionId) {
    try {
      chrome.runtime.sendMessage(
        { action: "responseReady", platform: PLATFORM_ID, response: text, injectionId },
        () => { if (chrome.runtime.lastError) {} }
      );
    } catch (err) { console.error("ZENOME [qwen] sendResponseReady error:", err); }
  }

  // Injects a prompt via nativeInputValueSetter, falls back to Enter if no send button.
  async function injectPrompt(promptText, injectionId) {
    try {
      const el = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
      if (!el) { console.error("ZENOME [qwen] input not found"); return; }
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(el, promptText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(PRE_SEND_DELAY_MS);
      const sendBtn = document.querySelector(SEL_SEND_BTN);
      if (sendBtn) { sendBtn.click(); }
      else { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); }
      const responseText = await waitForResponse();
      sendResponseReady(responseText, injectionId);
    } catch (err) { console.error("ZENOME [qwen] injectPrompt error:", err); }
  }

  // Polls for absence of loading indicator, then scrapes the last assistant message.
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          try {
            const isLoading = !!document.querySelector(SEL_LOADING);
            if (!isLoading || Date.now() >= deadline) {
              clearInterval(interval);
              const all = document.querySelectorAll(SEL_RESPONSE);
              resolve(all && all.length > 0 ? all[all.length - 1].innerText.trim() : "");
            }
          } catch (err) { clearInterval(interval); resolve(""); }
        }, POLL_INTERVAL_MS);
      }, PRE_SEND_DELAY_MS);
    });
  }

  function diagnose() {
    const inputEl   = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
    const sendBtn   = document.querySelector(SEL_SEND_BTN);
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
