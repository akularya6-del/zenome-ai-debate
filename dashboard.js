// dashboard.js — ZENOME full dashboard controller

let selectedModels = new Set();
let debateConfig = null;
let currentStatus = "idle";
let keepaliveInterval = null;
let logData = {};

// ── DOM Initialization ───────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await checkLoginStatus();
  await restoreState();
  startKeepalive();
});

// ── UI Event Listeners ───────────────────────────────────────────

function setupEventListeners() {
  // Model Cards
  document.querySelectorAll('.model-card').forEach(card => {
    card.addEventListener('click', () => toggleModelCard(card));
  });

  // Task Input & Rounds Slider
  document.getElementById('task-input').addEventListener('input', validateInputs);
  document.getElementById('rounds-slider').addEventListener('input', (e) => {
    document.getElementById('rounds-badge').textContent = e.target.value;
  });

  // Head AI Dropdown
  document.getElementById('head-ai-select').addEventListener('change', validateInputs);

  // Start Button
  document.getElementById('start-btn').addEventListener('click', handleStartDebate);

  // Settings Panel
  document.getElementById('btn-settings').addEventListener('click', toggleSettingsPanel);
  document.getElementById('btn-close-settings').addEventListener('click', toggleSettingsPanel);
  document.getElementById('settings-overlay').addEventListener('click', toggleSettingsPanel);
  
  // Settings values
  document.getElementById('setting-timeout').addEventListener('input', (e) => {
    document.getElementById('val-timeout').textContent = e.target.value;
  });
  document.getElementById('setting-delay').addEventListener('input', (e) => {
    document.getElementById('val-delay').textContent = e.target.value;
  });
  document.getElementById('btn-refresh-login').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-login');
    btn.textContent = "Checking...";
    await checkLoginStatus();
    btn.textContent = "Refresh Login Status";
  });

  // Downloads / Copy
  document.getElementById('btn-copy').addEventListener('click', handleCopyOutput);
  document.getElementById('btn-download-md').addEventListener('click', () => handleDownload('md'));
  document.getElementById('btn-download-txt').addEventListener('click', () => handleDownload('txt'));
}

// ── Core Logic ───────────────────────────────────────────────────

async function checkLoginStatus() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: "checkLoginStatus" }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== "ok") {
        resolve();
        return;
      }
      Object.entries(response.logins).forEach(([platform, isLoggedIn]) => {
        const card = document.querySelector(`.model-card[data-platform="${platform}"]`);
        if (card) {
          const dot = card.querySelector('.login-dot');
          dot.className = `login-dot ${isLoggedIn ? 'green' : 'red'}`;
        }
      });
      resolve();
    });
  });
}

function toggleModelCard(card) {
  if (currentStatus !== "idle") return; // locked while active
  const platform = card.dataset.platform;
  if (selectedModels.has(platform)) {
    selectedModels.delete(platform);
    card.classList.remove('selected');
  } else {
    selectedModels.add(platform);
    card.classList.add('selected');
  }
  updateHeadAIDropdown();
  validateInputs();
}

function updateHeadAIDropdown() {
  const select = document.getElementById('head-ai-select');
  const currentValue = select.value;
  select.innerHTML = '<option value="" disabled selected>Select orchestrator...</option>';
  
  if (selectedModels.size === 0) {
    select.disabled = true;
    select.innerHTML = '<option value="" disabled selected>Select models first...</option>';
    return;
  }
  
  select.disabled = false;
  selectedModels.forEach(platform => {
    const opt = document.createElement('option');
    opt.value = platform;
    opt.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);
    if (platform === currentValue) opt.selected = true;
    select.appendChild(opt);
  });
}

function validateInputs() {
  const task = document.getElementById('task-input').value.trim();
  const headAI = document.getElementById('head-ai-select').value;
  const startBtn = document.getElementById('start-btn');
  
  const isValid = task.length > 0 && selectedModels.size >= 2 && headAI;
  startBtn.disabled = !isValid;
}

function handleStartDebate() {
  const task = document.getElementById('task-input').value.trim();
  const headAI = document.getElementById('head-ai-select').value;
  const rounds = parseInt(document.getElementById('rounds-slider').value, 10);
  
  debateConfig = {
    models: Array.from(selectedModels),
    headAI,
    task,
    rounds
  };
  
  chrome.runtime.sendMessage({ action: "startDebate", config: debateConfig });
  
  transitionToLiveMode(debateConfig);
}

// ── UI Transitions & Updates ─────────────────────────────────────

function transitionToLiveMode(config) {
  document.getElementById('config-panel').classList.add('hidden');
  document.getElementById('live-monitor').classList.remove('hidden');
  document.getElementById('log-viewer').classList.remove('hidden');
  
  updateBadge("active", "ACTIVE");
  currentStatus = "active";
  
  // Build live monitor list
  const list = document.getElementById('model-status-list');
  list.innerHTML = "";
  config.models.forEach(model => {
    const name = model.charAt(0).toUpperCase() + model.slice(1);
    list.innerHTML += `
      <div class="status-row" id="row-${model}">
        <span class="platform-name">${name}</span>
        <span class="status-chip waiting" id="status-${model}">Waiting</span>
      </div>
    `;
  });
}

function updateBadge(className, text) {
  const badge = document.getElementById('status-badge');
  badge.className = `badge ${className}`;
  badge.textContent = text;
}

function updateModelStatus(platform, statusStr, wordCount) {
  const chip = document.getElementById(`status-${platform}`);
  if (!chip) return;
  chip.className = `status-chip ${statusStr}`;
  let text = statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
  if (statusStr === "done" && wordCount) text += ` (${wordCount}w)`;
  chip.textContent = text.replace('_', ' ');
}

function updateRoundProgress(round, totalRounds) {
  document.getElementById('round-progress').textContent = `Round ${round} of ${totalRounds}`;
  const pct = Math.round((round / totalRounds) * 100);
  document.getElementById('progress-fill').style.width = `${pct}%`;
}

// ── Logging & Final Output ───────────────────────────────────────

function appendLogEntry(round, platform, text) {
  if (!logData[round]) {
    logData[round] = {};
    const accordion = document.getElementById('log-accordion');
    const sec = document.createElement('div');
    sec.className = 'log-round-section';
    sec.innerHTML = `
      <div class="log-round-header" onclick="this.nextElementSibling.classList.toggle('open')">
        <span>Round ${round}</span><span>▼</span>
      </div>
      <div class="log-round-content" id="log-content-r${round}"></div>
    `;
    accordion.appendChild(sec);
  }
  
  const contentNode = document.getElementById(`log-content-r${round}`);
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const words = text.split(/\s+/).filter(w => w.length).length;
  const time = new Date().toLocaleTimeString();
  const pName = platform.toUpperCase();
  
  entry.innerHTML = `
    <div class="log-meta"><span>${pName}</span><span>${words} words • ${time}</span></div>
    <div class="log-text">${escapeHTML(text)}</div>
  `;
  contentNode.appendChild(entry);
}

function renderFinalOutput(data) {
  document.getElementById('live-monitor').classList.add('hidden');
  document.getElementById('final-output-panel').classList.remove('hidden');
  updateBadge("complete", "COMPLETE");
  currentStatus = "complete";

  if (data.parseError) {
    document.getElementById('output-rendered').innerHTML = `<p style="color:var(--error-color)">Parse Error: ${escapeHTML(data.parseError)}</p><pre>${escapeHTML(data.rawText)}</pre>`;
    return;
  }

  // Format main output based on desired format
  let mainHtml = escapeHTML(data.finalOutput || "");
  if (data.outputFormat === "code") {
    mainHtml = `<pre><code>${mainHtml}</code></pre>`;
  }
  document.getElementById('output-rendered').innerHTML = mainHtml;
  
  // Insights
  const ul = document.getElementById('output-insights');
  ul.innerHTML = "";
  if (data.keyInsights && data.keyInsights.length > 0) {
    data.keyInsights.forEach(i => {
      const li = document.createElement('li');
      li.textContent = i;
      ul.appendChild(li);
    });
  } else {
    ul.innerHTML = "<li>No specific insights provided.</li>";
  }

  // Agreement
  document.getElementById('output-agreement').textContent = data.modelAgreementSummary || "No summary provided.";
}

// ── Handlers & Utils ─────────────────────────────────────────────

function toggleSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  panel.classList.toggle('open');
  overlay.classList.toggle('hidden');
}

function handleCopyOutput() {
  const text = document.getElementById('output-rendered').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = "Copy", 2000);
  });
}

function handleDownload(ext) {
  const outArea = document.getElementById('output-rendered');
  let content = outArea.innerText;
  if (ext === 'md') {
    // Basic reconstruction for markdown from HTML rendering if needed, 
    // but innerText preserves most spacing and pre blocks.
  }
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zenome_output.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function startKeepalive() {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  keepaliveInterval = setInterval(() => {
    if (currentStatus !== "idle" && currentStatus !== "complete") {
      chrome.runtime.sendMessage({ action: "ping" }, () => {
        if(chrome.runtime.lastError) {} // Ignore
      });
    }
  }, 20000);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

// Session restore logic (basic implementation via messaging)
async function restoreState() {
  // In a full implementation, this reads from storage.session to rebuild UI.
  // For now we rely on the service worker event stream if running.
}

// ── Message Listener ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    switch (msg.action) {
      case "tabsOpened":
        console.log("All tabs successfully opened:", msg.tabCount);
        break;
      case "statusUpdate":
        if (msg.status === "opening_tabs" || msg.status === "synthesizing") {
          updateModelStatus("headai", msg.status.replace("_", " "));
        }
        break;
      case "roundStarted":
        updateRoundProgress(msg.round, msg.totalRounds);
        updateModelStatus("headai", "processing");
        break;
      case "modelStatusUpdate":
        updateModelStatus(msg.platform, msg.status, msg.wordCount);
        break;
      case "responseReady":
        appendLogEntry(msg.round || "unknown", msg.platform, msg.response);
        break;
      case "debateComplete":
        renderFinalOutput(msg.output);
        break;
      case "debateError":
        updateBadge("error", "ERROR");
        alert("Debate Error: " + msg.error);
        break;
      case "insufficientModels":
        updateBadge("error", "FAILED");
        alert("Debate halted: Insufficient models remaining.");
        break;
      case "headAIPaused":
        updateBadge("error", "PAUSED");
        alert("Debate paused: Head AI tab closed.");
        break;
      case "loginStatus":
        // Update login dots when background pushes login state changes
        Object.entries(msg).forEach(([key, val]) => {
          if (key === "action") return;
          const card = document.querySelector(`.model-card[data-platform="${key}"]`);
          if (card) {
            const dot = card.querySelector('.login-dot');
            if (dot) dot.className = `login-dot ${val ? 'green' : 'red'}`;
          }
        });
        break;
    }
  } catch (err) {
    console.error("Dashboard listener error:", err);
  }
  sendResponse({ status: "received" });
  return true;
});
