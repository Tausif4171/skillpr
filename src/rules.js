// rules.js — what a changed line is allowed to do without a human looking at it.
//
// Design rule (carried over from DecisionCapture): a finding only exists if we can
// point at the exact line that caused it. No line, no finding. The tool never
// guesses that something "looks risky" without quoting the text.

export const SEVERITY = { high: 40, med: 20, low: 8 };

const RULES = [
  {
    id: "shell-pipe-exec",
    severity: "high",
    title: "Downloads and immediately executes code",
    explain: "A piped shell runs whatever the server sends, right now, with your permissions. The payload can change after review.",
    test: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|fish)\b/i,
    scope: "any",
  },
  {
    id: "secret-path",
    severity: "high",
    title: "Touches a credential store",
    explain: "These paths hold private keys, cloud credentials, cookies or tokens. A skill that reads them can send them anywhere.",
    test: /(?:\.ssh\b|\.aws\b|\.npmrc\b|\.netrc\b|\.git-credentials\b|id_rsa|id_ed25519|Cookies\b|Login Data|Library\/Keychains|\.docker\/config\.json|\.kube\/config|\.gnupg)/i,
    scope: "any",
  },
  {
    id: "base64-blob",
    severity: "high",
    title: "Contains an opaque encoded blob",
    explain: "Long base64 or an explicit decode step hides what the code actually does. This is the single most common way a malicious skill is disguised.",
    test: /[A-Za-z0-9+/]{180,}={0,2}|\bbase64\s+(?:-d|--decode|-D)\b|\batob\s*\(/i,
    scope: "any",
  },
  {
    id: "eval-exec",
    severity: "high",
    title: "Executes constructed code",
    explain: "eval, new Function, child_process, subprocess or os.system turn text into execution. Legitimate skills rarely need this.",
    test: /\beval\s*\(|new\s+Function\s*\(|child_process|subprocess\.(?:run|call|Popen|check_output)|os\.system\s*\(|\bexecSync\s*\(/i,
    scope: "any",
  },
  {
    id: "remote-send",
    severity: "high",
    title: "Sends data to a remote endpoint",
    explain: "An upload or POST from inside a skill can carry anything it can read. Check the destination and the payload.",
    test: /(?:curl|wget)[^\n]*(?:-X\s*(?:POST|PUT|PATCH)|--data|--form|--upload-file|-F\s|-d\s+[@'"]?)|\b(?:webhook|pastebin|transfer\.sh|0x0\.st|discord\.com\/api\/webhooks|api\.telegram\.org|ngrok\.io)\b/i,
    scope: "any",
  },
  {
    id: "prompt-injection",
    severity: "high",
    title: "Instruction aimed at the agent, not the task",
    explain: "SKILL.md is instructions your agent obeys. Text telling it to hide things, skip confirmation or ignore prior rules is the prose attack surface — a code scanner never sees it.",
    test: /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+instructions|disregard\s+(?:the\s+)?(?:above|previous|prior)|do\s+not\s+(?:tell|inform|mention\s+to)\s+the\s+user|without\s+(?:asking|telling|confirming|the\s+user)|silently\s+(?:send|upload|run|post|delete)|new\s+system\s+prompt|you\s+are\s+now\s+(?:a|an|the)\b/i,
    scope: "prose",
  },
  {
    id: "exfiltration-intent",
    severity: "high",
    title: "Combines a send action with secrets",
    explain: "Send/upload/post within one line of a secret is the shape of exfiltration, even when each half looks fine alone.",
    test: /(?:send|upload|post|email|transmit|exfiltrate)[^\n]{0,80}(?:\.env|secret|token|credential|keychain|\.ssh|api[_-]?key|conversation|session)/i,
    scope: "any",
  },
  {
    id: "destructive-command",
    severity: "high",
    title: "Destructive or privileged shell command",
    explain: "rm -rf, force-push, chmod 777 and sudo have no undo. A skill should not need them to do its job.",
    test: /\brm\s+-rf?\b|\bgit\s+push\s+(?:--force|-f)\b|\bchmod\s+777\b|\bsudo\s+/i,
    scope: "any",
  },
  {
    id: "invisible-unicode",
    severity: "high",
    title: "Contains invisible or direction-flipping characters",
    explain: "Zero-width and bidi control characters let text render differently from what the agent reads. Practically never legitimate in a skill.",
    test: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/,
    scope: "any",
  },
  {
    id: "env-read",
    severity: "med",
    title: "Reads environment or .env files",
    explain: "Common in legitimate setup, but it is also the first step of credential theft. Confirm what it does with the values.",
    test: /\bcat\s+[^\n]*\.env\b|dotenv|\bos\.environ\b|process\.env\b/i,
    scope: "any",
  },
  {
    id: "network-fetch",
    severity: "med",
    title: "Fetches from the network",
    explain: "Remote content can change after you approve the skill. Pin the URL or vendor the file.",
    test: /\b(?:curl|wget|fetch)\s+[^\n]*https?:\/\//i,
    scope: "any",
  },
  {
    id: "credential-handling",
    severity: "med",
    title: "Handles a token or key explicitly",
    explain: "Skills that take secrets as input need a clear scope and a clear sink. Check where the value ends up.",
    test: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|bearer\s+[A-Za-z0-9._-]{10,}|password\s*[:=])\b/i,
    scope: "any",
  },
];

/** Tools that grant the agent new power if they appear in frontmatter. */
const DANGEROUS_TOOLS = /^(?:Bash|Shell|Execute|Terminal|Write|Edit|MultiEdit|Fetch|WebFetch|WebSearch|Task|Agent|Computer|.*\*)$/i;

function clip(s, max = 160) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/**
 * Check one added line against every rule.
 * Returns findings, each carrying file + line + the exact quoted text.
 */
export function checkLine({ text, file, lineNo, kind }) {
  if (!text || !text.trim()) return [];
  const findings = [];
  const isProse = kind === "prose";

  for (const rule of RULES) {
    if (rule.scope === "prose" && !isProse) continue;
    const m = rule.test.exec(text);
    if (!m) continue;
    // Evidence gate: the quote must be non-empty.
    const evidence = clip(text);
    if (!evidence) continue;
    findings.push({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      weight: SEVERITY[rule.severity],
      file,
      line: lineNo,
      matched: clip(m[0], 60),
      evidence,
      explain: rule.explain,
    });
  }
  return findings;
}

/** Compare allowed-tools between versions. Widening is the thing to notice. */
export function checkPermissions(oldFm, newFm) {
  const list = (v) => Array.isArray(v) ? v : (typeof v === "string" ? v.split(/\s*,\s*/) : []);
  const before = new Set(list(oldFm?.["allowed-tools"] ?? oldFm?.allowed_tools ?? oldFm?.tools));
  const after = list(newFm?.["allowed-tools"] ?? newFm?.allowed_tools ?? newFm?.tools);

  const added = after.filter(t => !before.has(t));
  const findings = [];

  for (const tool of added) {
    const dangerous = DANGEROUS_TOOLS.test(tool);
    findings.push({
      id: dangerous ? "permission-widen-dangerous" : "permission-widen",
      title: dangerous ? "Grants a powerful new tool" : "Grants a new tool",
      severity: dangerous ? "high" : "low",
      weight: dangerous ? SEVERITY.high : SEVERITY.low,
      file: "SKILL.md",
      line: null,
      subject: tool,
      matched: tool,
      evidence: `allowed-tools: ${after.join(", ")}`,
      explain: "The skill can now reach tooling it could not reach before. Widen permissions on purpose, not by accident.",
    });
  }
  return findings;
}

export function extractHosts(lines) {
  const hosts = new Set();
  for (const line of lines) {
    const re = /https?:\/\/([^\s/)"'`]+)/gi;
    let m;
    while ((m = re.exec(line)) !== null) hosts.add(m[1].toLowerCase());
  }
  return hosts;
}

export { RULES, clip };
