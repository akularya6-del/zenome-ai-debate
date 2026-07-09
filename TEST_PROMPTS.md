# ZENOME Quick Test Prompts

Use these prompts to quickly verify that the orchestrator, model injection, and Head AI synthesis are functioning correctly. 

Ensure you are logged into the web interfaces of the models you intend to use before starting!

---

## 1. Simple Test (Speed & Basic Orchestration)
**Goal:** Verify that a basic 1-round debate completes and synthesis works.
- **Rounds:** 1
- **Recommended Models:** ChatGPT, Gemini
- **Recommended Head AI:** ChatGPT
- **Task Prompt:**
  > What are the main differences between React and Vue?

**Expected Result:** The Head AI should generate a prompt for ChatGPT and Gemini. They should respond rapidly. The Head AI should then synthesize a final `document` or `answer` format detailing the differences.

---

## 2. Medium Test (Cross-Debate & Context)
**Goal:** Verify that the system handles multiple rounds and cross-debate prompting correctly.
- **Rounds:** 2
- **Recommended Models:** ChatGPT, Gemini, Perplexity
- **Recommended Head AI:** Gemini (or Claude if supported in future)
- **Task Prompt:**
  > Analyze the pros and cons of remote work for software teams.

**Expected Result:** 
- **Round 1:** Models will give initial pros/cons.
- **Round 2:** The Head AI will read all responses and issue targeted follow-up prompts pointing out contradictions or asking models to dive deeper into specific points raised by each other.
- **Synthesis:** A `report` formatted output summarizing the multi-faceted analysis.

---

## 3. Full Stress Test (Concurrency & High Load)
**Goal:** Verify the system can manage 5+ concurrent tabs without race conditions, and correctly synthesizes large amounts of token data.
- **Rounds:** 3
- **Recommended Models:** ChatGPT, Gemini, Perplexity, DeepSeek, Qwen
- **Recommended Head AI:** DeepSeek (or any capable of processing large contexts)
- **Task Prompt:**
  > What will be the most important AI development in the next 2 years?

**Expected Result:** 
You should see all 5 tabs open simultaneously. The Dashboard Live Monitor will track 6 entities (Head AI + 5 models) across 3 intensive rounds. The final synthesized output will be a highly comprehensive, multi-perspective `report` detailing consensus predictions and key divergences (e.g. AGI timelines vs Open Source model efficiency).
