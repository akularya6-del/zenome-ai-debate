// background.js — ZENOME Service Worker (state machine, tab coordinator)

import {
  getDebateState,
  setDebateState,
  updateDebateState,
  clearDebateState
} from './utils/state.js';

import { normalizeResponse } from './utils/normalizer.js';
import { inferOutputFormat } from './utils/format-infer.js';

// ── Named Constants ──────────────────────────────────────────────
const INJECT_DELAY_MS = 4000;
const RESPONSE_TIMEOUT_MS = 90000;
const MAX_RETRY_ATTEMPTS = 1;
const TAB_LOAD_TIMEOUT_MS = 30000;
const STABILIZATION_DELAY_MS = 500;

// Maps platform keys to their base URLs.
const PLATFORM_URLS = {
  chatgpt: "https://chat.openai.com/",
  gemini: "https://gemini.google.com/app",
  perplexity: "https://www.perplexity.ai/",
  deepseek: "https://chat.deepseek.com/",
  kimi: "https://www.kimi.com/",
  qwen: "https://chat.qwen.ai/",
  grok: "https://grok.com/"
};

// Maps platform keys to cookie domains for login checks.
const PLATFORM_DOMAINS = {
  chatgpt: "chat.openai.com",
  gemini: "google.com",
  perplexity: "www.perplexity.ai",
  deepseek: "chat.deepseek.com",
  kimi: "kimi.com",
  qwen: "qwen.ai",
  grok: "grok.com"
};

// Platform-specific session cookie names for login detection.
const LOGIN_COOKIES = {
  chatgpt: "__Secure-next-auth.session-token",
  gemini: "SAPISID",
  perplexity: "pplx-session",
  deepseek: "ds_session_id"
};

// In-memory timeout handles keyed by platform (not persisted).
const responseTimeouts = {};
// Tracks Head AI JSON parse retry count per round.
let headAIRetryCount = 0;

// ── Helpers ──────────────────────────────────────────────────────

// Returns the base URL for a given platform key.
function platformURL(platform) {
  return PLATFORM_URLS[platform] || null;
}

// Builds the initial empty state object for a new debate.
function buildInitialState(config, dashboardTabId) {
  const models = {};
  config.models.forEach((m) => {
    models[m] = { tabId: null, status: "waiting" };
  });
  return {
    status: "opening_tabs",
    config,
    currentRound: 0,
    tabRegistry: {
      headAI: { tabId: null, platform: config.headAI, status: "idle" },
      models
    },
    responses: {},
    headAIOutputs: {},
    currentInjectionIds: {},
    dashboardTabId,
    finalOutput: null,
    error: null
  };
}

// Sends a message to the dashboard tab, guarding for errors.
async function notifyDashboard(action, payload) {
  try {
    const state = await getDebateState();
    if (!state || !state.dashboardTabId) return;
    chrome.tabs.sendMessage(
      state.dashboardTabId,
      Object.assign({ action }, payload),
      () => {
        if (chrome.runtime.lastError) {
          console.warn("notifyDashboard:", chrome.runtime.lastError.message);
        }
      }
    );
  } catch (err) {
    console.error("notifyDashboard exception:", err);
  }
}

// Logs an error, persists it in state, and notifies the dashboard.
async function reportError(message) {
  console.error("ZENOME error:", message);
  try {
    await updateDebateState({ status: "error", error: message });
  } catch (_) { /* best-effort */ }
  await notifyDashboard("debateError", { error: message });
}

// Creates a tab and resolves once it reaches "complete" status.
function createTabAndWaitReady(url) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.create({ url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        const tabId = tab.id;
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(tabId); // resolve anyway after timeout
          }
        }, TAB_LOAD_TIMEOUT_MS);
        const listener = (updatedId, info) => {
          if (updatedId === tabId && info.status === "complete" && !settled) {
            settled = true;
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(tabId);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Sends a message to a specific tab, returning a promise.
function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("sendTabMessage error:", chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      console.error("sendTabMessage exception:", err);
      resolve(null);
    }
  });
}

// Counts how many active (non-dropped, non-timed_out) models remain.
async function countActiveModels() {
  const state = await getDebateState();
  if (!state) return 0;
  const models = state.tabRegistry.models;
  return Object.values(models).filter(
    (m) => m.status !== "dropped" && m.status !== "timed_out"
  ).length;
}

// ── 1. handleStartDebate ─────────────────────────────────────────

// Initialises a new debate: stores config, opens tabs, starts round 1.
async function handleStartDebate(config, senderTabId) {
  try {
    const state = buildInitialState(config, senderTabId);
    await setDebateState(state);
    await notifyDashboard("statusUpdate", { status: "opening_tabs" });
    await openAllTabs(config);
  } catch (err) {
    await reportError("handleStartDebate failed: " + err.message);
  }
}

// ── 2. openAllTabs ───────────────────────────────────────────────

// Opens Head AI + model tabs in parallel, waits for load, then starts round 1.
async function openAllTabs(config) {
  try {
    // Open Head AI tab
    const headAIUrl = platformURL(config.headAI);
    const headTabId = await createTabAndWaitReady(headAIUrl);

    // Open all model tabs simultaneously
    const modelEntries = config.models.map((m) => ({
      platform: m,
      promise: createTabAndWaitReady(platformURL(m))
    }));
    const modelTabIds = await Promise.all(modelEntries.map((e) => e.promise));

    // Build registry updates
    const state = await getDebateState();
    state.tabRegistry.headAI.tabId = headTabId;
    state.tabRegistry.headAI.status = "ready";
    modelEntries.forEach((entry, i) => {
      state.tabRegistry.models[entry.platform].tabId = modelTabIds[i];
      state.tabRegistry.models[entry.platform].status = "ready";
    });
    await setDebateState(state);
    await notifyDashboard("tabsOpened", { tabCount: modelTabIds.length + 1 });

    // Wait for pages to stabilise then begin round 1
    setTimeout(() => startRound(1), INJECT_DELAY_MS);
  } catch (err) {
    await reportError("openAllTabs failed: " + err.message);
  }
}

// ── 3. startRound ────────────────────────────────────────────────

// Begins a debate round: updates state, notifies dashboard, injects Head AI.
async function startRound(roundNumber) {
  try {
    headAIRetryCount = 0;
    const state = await getDebateState();
    state.currentRound = roundNumber;
    state.status = "head_ai_processing";
    if (!state.responses[roundNumber]) {
      state.responses[roundNumber] = {};
    }
    await setDebateState(state);
    await notifyDashboard("roundStarted", {
      round: roundNumber,
      totalRounds: state.config.rounds
    });

    const prompt = roundNumber === 1
      ? buildHeadAIRound1Prompt(state.config.task, state.config.models, state.config.rounds)
      : buildHeadAICrossDebatePrompt(roundNumber, state.responses);

    await sendTabMessage(state.tabRegistry.headAI.tabId, {
      action: "injectHeadAI",
      prompt,
      injectionId: "inj_headai_r" + roundNumber + "_" + Date.now()
    });
    // Head AI content script will async reply via headAIResponseReady message
  } catch (err) {
    await reportError("startRound(" + roundNumber + ") failed: " + err.message);
  }
}

// ── 4. handleHeadAIResponse ──────────────────────────────────────

// Processes the Head AI's raw response, retries once on parse failure.
async function handleHeadAIResponse(parsed, rawText, data) {
  try {
    const state = await getDebateState();
    let result;
    if (parsed && data) {
      result = { success: true, data };
    } else {
      result = parseHeadAIJSON(rawText);
    }

    if (!result.success) {
      if (headAIRetryCount < MAX_RETRY_ATTEMPTS) {
        headAIRetryCount++;
        const retryPrompt = buildJSONCorrectionPrompt(rawText);
        await sendTabMessage(state.tabRegistry.headAI.tabId, {
          action: "injectHeadAI",
          prompt: retryPrompt,
          injectionId: "inj_headai_retry_" + Date.now()
        });
        return; // wait for next headAIResponseReady
      }
      await reportError("Head AI JSON parse failed after retry: " + result.error);
      return;
    }

    // Store Head AI output for this round
    state.headAIOutputs[state.currentRound] = result.data;
    await setDebateState(state);

    if (result.data.convergenceDetected === true) {
      await startSynthesis();
    } else {
      const prompts = result.data.perModelPrompts || {};
      await injectAllModels(prompts, state.currentRound);
    }
  } catch (err) {
    await reportError("handleHeadAIResponse failed: " + err.message);
  }
}

// ── 5. injectAllModels ───────────────────────────────────────────

// Sends personalised prompts to every model tab in parallel.
async function injectAllModels(perModelPrompts, roundNumber) {
  try {
    const state = await getDebateState();
    state.status = "round_in_progress";
    const injectionIds = {};
    const activeModels = Object.keys(state.tabRegistry.models).filter(
      (p) => state.tabRegistry.models[p].status !== "dropped"
    );

    activeModels.forEach((platform) => {
      const id = "inj_r" + roundNumber + "_" + platform + "_" + Date.now();
      injectionIds[platform] = id;
      state.tabRegistry.models[platform].status = "injecting";
    });
    state.currentInjectionIds = injectionIds;
    await setDebateState(state);

    // Send inject commands simultaneously
    const promises = activeModels.map((platform) => {
      const prompt = perModelPrompts[platform] || perModelPrompts.default || state.config.task;
      const tabId = state.tabRegistry.models[platform].tabId;
      setModelStatus(platform, "processing");
      notifyDashboard("modelStatusUpdate", { platform, status: "processing" });
      setupModelTimeout(platform);
      return sendTabMessage(tabId, {
        action: "inject",
        prompt,
        injectionId: injectionIds[platform]
      });
    });
    await Promise.all(promises);
  } catch (err) {
    await reportError("injectAllModels failed: " + err.message);
  }
}

// Sets a per-model response timeout that fires after RESPONSE_TIMEOUT_MS.
function setupModelTimeout(platform) {
  clearModelTimeout(platform);
  responseTimeouts[platform] = setTimeout(async () => {
    await handleModelTimeout(platform);
  }, RESPONSE_TIMEOUT_MS);
}

// Clears an existing per-model timeout if any.
function clearModelTimeout(platform) {
  if (responseTimeouts[platform]) {
    clearTimeout(responseTimeouts[platform]);
    delete responseTimeouts[platform];
  }
}

// Marks a model as timed out and checks remaining model count.
async function handleModelTimeout(platform) {
  try {
    await setModelStatus(platform, "timed_out");
    await notifyDashboard("modelStatusUpdate", { platform, status: "timed_out" });
    await checkAllModelsDone();
  } catch (err) {
    await reportError("handleModelTimeout failed: " + err.message);
  }
}

// Updates a single model's status in persisted state.
async function setModelStatus(platform, status) {
  try {
    const state = await getDebateState();
    if (state && state.tabRegistry.models[platform]) {
      state.tabRegistry.models[platform].status = status;
      await setDebateState(state);
    }
  } catch (err) {
    await reportError("setModelStatus error: " + err.message);
  }
}

// ── 6. handleResponseReady ───────────────────────────────────────

// Receives a model's scraped response, validates injection ID, stores result.
async function handleResponseReady(platform, response, injectionId) {
  try {
    const state = await getDebateState();
    // Validate injectionId — discard stale responses silently
    if (state.currentInjectionIds[platform] !== injectionId) {
      console.warn("Stale injectionId for", platform, "— discarding");
      return;
    }
    clearModelTimeout(platform);
    const normalized = normalizeResponse(response, platform, state.currentRound);
    state.responses[state.currentRound][platform] = normalized;
    state.tabRegistry.models[platform].status = "done";
    await setDebateState(state);
    await notifyDashboard("modelStatusUpdate", { platform, status: "done", wordCount: normalized.wordCount });
    await checkAllModelsDone();
  } catch (err) {
    await reportError("handleResponseReady failed: " + err.message);
  }
}

// Checks if every active model has finished (done or timed_out) for this round.
async function checkAllModelsDone() {
  try {
    const state = await getDebateState();
    if (!state) return;
    const models = state.tabRegistry.models;
    const pending = Object.values(models).filter(
      (m) => m.status !== "done" && m.status !== "timed_out" && m.status !== "dropped"
    );
    if (pending.length === 0) {
      await onAllModelsComplete();
    }
  } catch (err) {
    await reportError("checkAllModelsDone error: " + err.message);
  }
}

// ── 7. onAllModelsComplete ───────────────────────────────────────

// Decides whether to advance to the next round or begin synthesis.
async function onAllModelsComplete() {
  try {
    const state = await getDebateState();
    if (state.currentRound < state.config.rounds) {
      await startRound(state.currentRound + 1);
    } else {
      await startSynthesis();
    }
  } catch (err) {
    await reportError("onAllModelsComplete failed: " + err.message);
  }
}

// ── 8. startSynthesis ────────────────────────────────────────────

// Triggers the final synthesis phase via the Head AI.
async function startSynthesis() {
  try {
    const state = await getDebateState();
    state.status = "synthesizing";
    await setDebateState(state);
    await notifyDashboard("statusUpdate", { status: "synthesizing" });

    const format = inferOutputFormat(state.config.task);
    const prompt = buildSynthesisPrompt(state.config.task, state.responses, format);
    await sendTabMessage(state.tabRegistry.headAI.tabId, {
      action: "injectHeadAISynthesis",
      prompt,
      injectionId: "inj_synth_" + Date.now()
    });
  } catch (err) {
    await reportError("startSynthesis failed: " + err.message);
  }
}

// ── 9. handleSynthesisResponse ───────────────────────────────────

// Parses the synthesis JSON, stores final output, marks debate complete.
async function handleSynthesisResponse(rawText) {
  try {
    const result = parseHeadAIJSON(rawText);
    const state = await getDebateState();
    if (result.success) {
      state.finalOutput = result.data;
    } else {
      state.finalOutput = { rawText, parseError: result.error };
    }
    state.status = "complete";
    await setDebateState(state);
    await notifyDashboard("debateComplete", { output: state.finalOutput });
  } catch (err) {
    await reportError("handleSynthesisResponse failed: " + err.message);
  }
}

// ── 10. parseHeadAIJSON ──────────────────────────────────────────

// Parses raw Head AI text into JSON using multiple extraction strategies.
function parseHeadAIJSON(rawText) {
  const raw = (rawText || "").trim();
  if (!raw) return { success: false, data: null, error: "Empty input" };

  // Strategy 1: Direct parse (AI returned pure JSON)
  const directResult = tryParse(raw);
  if (directResult) return { success: true, data: directResult, error: null };

  // Strategy 2: Extract from markdown code fences anywhere in text
  const fenceResult = extractFromCodeFence(raw);
  if (fenceResult) return { success: true, data: fenceResult, error: null };

  // Strategy 3: Balanced-brace extraction for objects { ... }
  const braceResult = extractBalancedBlock(raw, "{", "}");
  if (braceResult) return { success: true, data: braceResult, error: null };

  // Strategy 4: Balanced-bracket extraction for arrays [ ... ]
  const bracketResult = extractBalancedBlock(raw, "[", "]");
  if (bracketResult) return { success: true, data: bracketResult, error: null };

  // All strategies failed — log raw text for debugging
  console.error("parseHeadAIJSON: ALL strategies failed.");
  console.log("parseHeadAIJSON raw input (first 500 chars):", raw.substring(0, 500));
  return { success: false, data: null, error: "No JSON object found" };
}

// Attempts JSON.parse, returns parsed data or null.
function tryParse(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

// Extracts JSON from inside the first markdown code fence found anywhere.
function extractFromCodeFence(text) {
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    const result = tryParse(candidate);
    if (result) return result;
  }
  return null;
}

// Walks the string to find a balanced block of open/close delimiters.
function extractBalancedBlock(text, openChar, closeChar) {
  const start = text.indexOf(openChar);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        const candidate = text.substring(start, i + 1);
        const result = tryParse(candidate);
        if (result) return result;
        // If parse failed, the braces were decorative — keep scanning
        return null;
      }
    }
  }
  return null;
}

// Builds a retry prompt asking Head AI to fix its JSON output.
function buildJSONCorrectionPrompt(badText) {
  return `Your previous response was not valid JSON. ` +
    `I need ONLY a raw JSON object — no markdown fences, no explanations, no text outside the JSON. ` +
    `Start your response with { and end with }. Nothing else. ` +
    `Here is your broken output to fix:\n\n${badText}`;
}

// ── 11. buildHeadAIRound1Prompt ──────────────────────────────────

// Constructs the initial system prompt sent to the Head AI in round 1.
function buildHeadAIRound1Prompt(task, models, rounds) {
  const modelList = models.join(", ");
  const modelKeys = models.map(m => `    "${m}": "your prompt for ${m}"`).join(",\n");
  return `You are the Head AI orchestrator in ZENOME, a multi-model debate system.

PARTICIPATING MODELS: ${modelList}
TOTAL ROUNDS: ${rounds}
USER TASK: ${task}

Your job is to create a tailored prompt for EACH model to answer the user's task.
Vary the angle or emphasis per model to get diverse perspectives.

CRITICAL RULES:
- Your ENTIRE response must be a single JSON object.
- Do NOT write any text before or after the JSON.
- Do NOT wrap it in markdown code fences.
- Do NOT add explanations, greetings, or commentary.
- Start your response with the { character and end with }.

Required JSON schema:
{
  "round": 1,
  "convergenceDetected": false,
  "perModelPrompts": {
${modelKeys}
  },
  "strategy": "brief description of your prompting strategy"
}`;
}

// ── 12. buildHeadAICrossDebatePrompt ─────────────────────────────

// Formats previous responses into a structured prompt for the next round.
function buildHeadAICrossDebatePrompt(roundNumber, responses) {
  let responseBlock = "";
  for (let r = 1; r < roundNumber; r++) {
    const roundData = responses[r] || {};
    responseBlock += `\n--- ROUND ${r} RESPONSES ---\n`;
    Object.entries(roundData).forEach(([platform, data]) => {
      responseBlock += `\n[${platform.toUpperCase()}] (${data.wordCount} words):\n${data.text}\n`;
    });
  }
  return `You are the Head AI orchestrator. This is Round ${roundNumber}.

Review all previous model responses below, then create NEW prompts that:
1. Address gaps or contradictions between models
2. Push models toward deeper analysis
3. Detect convergence — if models substantially agree, set convergenceDetected: true
${responseBlock}

CRITICAL: Respond with ONLY a JSON object. No text before or after. Start with { and end with }.

Required JSON schema:
{
  "round": ${roundNumber},
  "convergenceDetected": false,
  "perModelPrompts": { ... },
  "strategy": "..."
}`;
}

// ── 13. buildSynthesisPrompt ─────────────────────────────────────

// Constructs the final synthesis prompt from the full debate history.
function buildSynthesisPrompt(task, allResponses, outputFormat) {
  let history = "";
  Object.entries(allResponses).forEach(([round, platforms]) => {
    history += `\n=== ROUND ${round} ===\n`;
    Object.entries(platforms).forEach(([platform, data]) => {
      history += `[${platform.toUpperCase()}] (${data.wordCount} words):\n${data.text}\n\n`;
    });
  });
  return `You are the Head AI synthesiser. The multi-model debate is complete.

ORIGINAL TASK: ${task}
DESIRED OUTPUT FORMAT: ${outputFormat}

FULL DEBATE HISTORY:
${history}

Synthesise all model responses into a single, high-quality final answer.

CRITICAL: Your ENTIRE response must be a single JSON object. No text before or after. Start with { and end with }.

Required JSON schema:
{
  "round": "synthesis",
  "outputFormat": "${outputFormat}",
  "finalOutput": "the complete synthesised answer as a string",
  "keyInsights": ["insight 1", "insight 2"],
  "modelAgreementSummary": "summary of where models agreed and disagreed"
}`;
}

// ── 14. handleTabClosed ──────────────────────────────────────────

// Reacts when a tab is closed: pauses if Head AI, drops if model.
async function handleTabClosed(tabId) {
  try {
    const state = await getDebateState();
    if (!state || state.status === "idle" || state.status === "complete") return;

    // Check if it was the Head AI tab
    if (state.tabRegistry.headAI.tabId === tabId) {
      state.status = "error";
      state.tabRegistry.headAI.status = "dropped";
      await setDebateState(state);
      await notifyDashboard("headAIPaused", { reason: "Head AI tab was closed" });
      return;
    }

    // Check model tabs
    for (const [platform, info] of Object.entries(state.tabRegistry.models)) {
      if (info.tabId === tabId) {
        state.tabRegistry.models[platform].status = "dropped";
        await setDebateState(state);
        clearModelTimeout(platform);
        await notifyDashboard("modelStatusUpdate", { platform, status: "dropped" });
        const active = await countActiveModels();
        if (active < 2) {
          state.status = "error";
          await setDebateState(state);
          await notifyDashboard("insufficientModels", { remaining: active });
        } else {
          await checkAllModelsDone();
        }
        return;
      }
    }
  } catch (err) {
    await reportError("handleTabClosed error: " + err.message);
  }
}

// ── 15. checkLoginStatus ─────────────────────────────────────────

// Checks cookies for each platform to infer login state.
async function checkLoginStatus() {
  const result = {};
  const platforms = Object.keys(PLATFORM_DOMAINS);
  for (const platform of platforms) {
    result[platform] = await checkPlatformLogin(platform);
  }
  return result;
}

// Checks a single platform's cookies for a session indicator.
function checkPlatformLogin(platform) {
  return new Promise((resolve) => {
    try {
      const domain = PLATFORM_DOMAINS[platform];
      chrome.cookies.getAll({ domain }, (cookies) => {
        if (chrome.runtime.lastError) {
          console.warn("Cookie check error for", platform, chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        if (!cookies || cookies.length === 0) {
          resolve(false);
          return;
        }
        const targetName = LOGIN_COOKIES[platform];
        if (targetName) {
          resolve(cookies.some((c) => c.name === targetName));
        } else {
          // For kimi, qwen, grok: any non-empty cookie counts
          resolve(cookies.length > 0);
        }
      });
    } catch (err) {
      console.error("checkPlatformLogin exception:", err);
      resolve(false);
    }
  });
}

// ── 16. openDashboardTab ─────────────────────────────────────────

// Opens dashboard in a new tab, or focuses it if already open.
function openDashboardTab() {
  const dashURL = chrome.runtime.getURL("dashboard.html");
  try {
    chrome.tabs.query({ url: dashURL }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error("Dashboard query error:", chrome.runtime.lastError);
        return;
      }
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true }, () => {
          if (chrome.runtime.lastError) {
            console.error("Dashboard focus error:", chrome.runtime.lastError);
          }
        });
      } else {
        chrome.tabs.create({ url: dashURL }, () => {
          if (chrome.runtime.lastError) {
            console.error("Dashboard create error:", chrome.runtime.lastError);
          }
        });
      }
    });
  } catch (err) {
    console.error("openDashboardTab exception:", err);
  }
}

// ── Chrome Event Listeners ───────────────────────────────────────

// Opens or focuses dashboard when extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  openDashboardTab();
});

// Central message router for all incoming runtime messages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case "ping":
      sendResponse({ alive: true });
      break;

    case "startDebate":
      handleStartDebate(msg.config, sender.tab ? sender.tab.id : null);
      sendResponse({ status: "started" });
      break;

    case "checkLoginStatus":
      checkLoginStatus().then((result) => {
        sendResponse({ status: "ok", logins: result });
      }).catch((err) => {
        console.error("checkLoginStatus error:", err);
        sendResponse({ status: "error", error: err.message });
      });
      break;

    case "loginRequired":
      notifyDashboard("loginStatus", { [msg.platform]: false });
      sendResponse({ status: "received" });
      break;

    case "responseReady":
      handleResponseReady(msg.platform, msg.response, msg.injectionId);
      sendResponse({ status: "received" });
      break;

    case "headAIResponseReady":
      handleHeadAIResponse(msg.parsed, msg.rawText, msg.data);
      sendResponse({ status: "received" });
      break;

    case "headAISynthesisReady":
      handleSynthesisResponse(msg.rawText || JSON.stringify(msg.data));
      sendResponse({ status: "received" });
      break;

    case "resetDebate":
      clearDebateState().then(() => {
        sendResponse({ status: "reset" });
      }).catch((err) => {
        console.error("resetDebate error:", err);
        sendResponse({ status: "error", error: err.message });
      });
      break;

    default:
      console.warn("Unhandled message action:", msg.action);
      sendResponse({ status: "unhandled" });
  }
  return true; // keeps message channel open for async sendResponse
});

// Handles tab closure during an active debate.
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  handleTabClosed(tabId);
});
