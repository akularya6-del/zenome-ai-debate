// content-grok.js — ZENOME content script for Grok
(function() {
  if (window.__zenome_grok_loaded) return;
  window.__zenome_grok_loaded = true;

  const PLATFORM_ID = "grok";
  const POLL_INTERVAL_MS = 800;
  const PRE_SEND_DELAY_MS = 400;
  const RESPONSE_TIMEOUT_MS = 90000;
  const SEL_INPUT_PRIMARY = '[contenteditable="true"]';
  const SEL_INPUT_FALLBACK = '.message-input';
  const SEL_SEND_PRIMARY = 'button[aria-label*="Send"]';
  const SEL_SEND_FALLBACK = 'button[type="submit"]';
  const SEL_COMPLETE = '.message-actions, .response-actions';
  const SEL_RESPONSE = '.response-message:last-child';
  const SEL_RESPONSE_FB = '[data-role="assistant"]';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function sendResponseReady(text, injectionId) {
    try { chrome.runtime.sendMessage({ action: "responseReady", platform: PLATFORM_ID, response: text, injectionId }, () => { if (chrome.runtime.lastError) {} }); }
    catch (err) { console.error("ZENOME [grok] sendResponseReady error:", err); }
  }
  async function injectPrompt(promptText, injectionId) {
    try {
      const el = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
      if (!el) { console.error("ZENOME [grok] input not found"); return; }
      el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, promptText);
      await sleep(PRE_SEND_DELAY_MS);
      const sendBtn = document.querySelector(SEL_SEND_PRIMARY) || document.querySelector(SEL_SEND_FALLBACK);
      if (!sendBtn) { console.error("ZENOME [grok] send button not found"); return; }
      sendBtn.click();
      sendResponseReady(await waitForResponse(), injectionId);
    } catch (err) { console.error("ZENOME [grok] injectPrompt error:", err); }
  }
  function waitForResponse() {
    return new Promise((resolve) => {
      const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
      setTimeout(() => {
        const interval = setInterval(() => {
          try {
            if (document.querySelector(SEL_COMPLETE) || Date.now() >= deadline) {
              clearInterval(interval);
              const p = document.querySelector(SEL_RESPONSE);
              if (p) { resolve(p.innerText.trim()); return; }
              const all = document.querySelectorAll(SEL_RESPONSE_FB);
              resolve(all && all.length > 0 ? all[all.length - 1].innerText.trim() : "");
            }
          } catch (err) { clearInterval(interval); resolve(""); }
        }, POLL_INTERVAL_MS);
      }, PRE_SEND_DELAY_MS);
    });
  }
  function diagnose() {
    const i = document.querySelector(SEL_INPUT_PRIMARY) || document.querySelector(SEL_INPUT_FALLBACK);
    const s = document.querySelector(SEL_SEND_PRIMARY) || document.querySelector(SEL_SEND_FALLBACK);
    return { inputVisible: !!i, sendBtnDisabled: s ? s.disabled : true, hasPartialResponse: !!document.querySelector(SEL_COMPLETE), url: location.href };
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "inject") { injectPrompt(msg.prompt, msg.injectionId); sendResponse({ status: "injecting", platform: PLATFORM_ID }); }
    else if (msg.action === "diagnose") { sendResponse(diagnose()); }
    else { sendResponse({ status: "unknown_action" }); }
    return true;
  });
})();
