// content-chatgpt.js — ZENOME content script for ChatGPT
(function() {
  // Guard against duplicate injection on SPA navigation
  if (window.__zenome_chatgpt_loaded) return;
  window.__zenome_chatgpt_loaded = true;

  const PLATFORM_ID = "chatgpt";
  const POLL_INTERVAL_MS = 800;
  const PRE_SEND_DELAY_MS = 500;
  const RESPONSE_TIMEOUT_MS = 90000;

  const SEL_INPUT        = '#prompt-textarea';
  const SEL_SEND_BTN     = '[data-testid="send-button"]';
  const SEL_ASSISTANT    = '[data-message-author-role="assistant"]';
  const SEL_LOGIN_BTN    = '[data-testid="login-button"]';

  // Pauses execution for a given number of milliseconds.
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Sends a responseReady message to the service worker with the scraped text.
  function sendResponseReady(text, injectionId) {
    try {
      chrome.runtime.sendMessage(
        { action: "responseReady", platform: PLATFORM_ID, response: text, injectionId },
        () => { if (chrome.runtime.lastError) { /* tab may be gone */ } }
      );
    } catch (err) {
      console.error("ZENOME [chatgpt] sendResponseReady error:", err);
    }
  }

  // Notifies the service worker that login is required on this platform.
  function sendLoginRequired() {
    try {
      chrome.runtime.sendMessage(
        { action: "loginRequired", platform: PLATFORM_ID },
        () => { if (chrome.runtime.lastError) { /* ignore */ } }
      );
    } catch (err) {
      console.error("ZENOME [chatgpt] sendLoginRequired error:", err);
    }
  }

  // Injects a prompt into the ChatGPT input using the nativeInputValueSetter pattern.
  async function injectPrompt(promptText, injectionId) {
    try {
      if (document.querySelector(SEL_LOGIN_BTN)) {
        sendLoginRequired();
        return;
      }
      const inputEl = document.querySelector(SEL_INPUT);
      if (!inputEl) { console.error("ZENOME [chatgpt] input textarea not found"); return; }

      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeSetter.call(inputEl, promptText);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(PRE_SEND_DELAY_MS);

      const sendBtn = document.querySelector(SEL_SEND_BTN);
      if (!sendBtn) { console.error("ZENOME [chatgpt] send button not found"); return; }
      sendBtn.click();

      const responseText = await waitForResponse();
      sendResponseReady(responseText, injectionId);
    } catch (err) {
      console.error("ZENOME [chatgpt] injectPrompt error:", err);
    }
  }

  // Polls until the send button is re-enabled, then scrapes the last assistant message.
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      const interval = setInterval(() => {
        try {
          const sendBtn = document.querySelector(SEL_SEND_BTN);
          const isComplete = sendBtn && !sendBtn.disabled;
          if (isComplete || Date.now() >= deadline) {
            clearInterval(interval);
            const messages = document.querySelectorAll(SEL_ASSISTANT);
            if (!messages || messages.length === 0) { resolve(""); return; }
            resolve(messages[messages.length - 1].innerText.trim());
          }
        } catch (err) {
          clearInterval(interval);
          console.error("ZENOME [chatgpt] waitForResponse poll error:", err);
          resolve("");
        }
      }, POLL_INTERVAL_MS);
    });
  }

  // Returns a diagnostic snapshot of the current page state.
  function diagnose() {
    const inputEl  = document.querySelector(SEL_INPUT);
    const sendBtn  = document.querySelector(SEL_SEND_BTN);
    const messages = document.querySelectorAll(SEL_ASSISTANT);
    return {
      inputVisible:      !!inputEl,
      sendBtnDisabled:   sendBtn ? sendBtn.disabled : true,
      hasPartialResponse: messages && messages.length > 0,
      url:               location.href
    };
  }

  // Routes incoming commands from the service worker.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "inject") {
      injectPrompt(msg.prompt, msg.injectionId);
      sendResponse({ status: "injecting", platform: PLATFORM_ID });
    } else if (msg.action === "diagnose") {
      sendResponse(diagnose());
    } else {
      sendResponse({ status: "unknown_action" });
    }
    return true;
  });
})();
