// Infers the target output format based on keywords in the task prompt.
export function inferOutputFormat(taskPrompt) {
  const promptLower = (taskPrompt || "").toLowerCase();
  if (/\b(write|draft|compose)\b/.test(promptLower)) {
    return "document";
  }
  if (/\b(code|script|function)\b/.test(promptLower)) {
    return "code";
  }
  if (/\b(compare|versus|pros)\b/.test(promptLower)) {
    return "comparison";
  }
  if (/\b(analyze|evaluate|assess)\b/.test(promptLower)) {
    return "report";
  }
  return "answer";
}
