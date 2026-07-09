// Reads the full debate state object from chrome.storage.session.
export async function getDebateState() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.session.get("zenome_state", (result) => {
        if (chrome.runtime.lastError) {
          console.error("getDebateState error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve(result.zenome_state || null);
        }
      });
    } catch (err) {
      console.error("getDebateState exception:", err);
      reject(err);
    }
  });
}

// Writes the full debate state object to chrome.storage.session.
export async function setDebateState(stateObj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.session.set({ "zenome_state": stateObj }, () => {
        if (chrome.runtime.lastError) {
          console.error("setDebateState error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error("setDebateState exception:", err);
      reject(err);
    }
  });
}

// Reads the current state, merges partialObj, and writes it back.
export async function updateDebateState(partialObj) {
  try {
    const currentState = await getDebateState() || {};
    const updatedState = Object.assign({}, currentState, partialObj);
    await setDebateState(updatedState);
  } catch (err) {
    console.error("updateDebateState exception:", err);
    throw err;
  }
}

// Deletes the zenome_state key from chrome.storage.session.
export async function clearDebateState() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.session.remove("zenome_state", () => {
        if (chrome.runtime.lastError) {
          console.error("clearDebateState error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error("clearDebateState exception:", err);
      reject(err);
    }
  });
}
