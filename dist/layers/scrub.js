/**
 * @git-fabric/aiana — scrub layer
 *
 * Removes PII and secrets from text before it is embedded or stored.
 * All replacements are idempotent and safe to call multiple times.
 */
// Each entry: [pattern, replacement]
const SCRUB_RULES = [
    // GitHub tokens
    [/ghp_[A-Za-z0-9]+/g, "[REDACTED]"],
    [/ghs_[A-Za-z0-9]+/g, "[REDACTED]"],
    [/github_pat_[A-Za-z0-9_]+/g, "[REDACTED]"],
    // OpenAI keys
    [/sk-[A-Za-z0-9\-_]{20,}/g, "[REDACTED]"],
    // Generic Bearer tokens in Authorization headers / inline strings
    [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]"],
    // JWT tokens — three base64url segments separated by dots
    // Require at least 10 chars per segment to avoid false positives on version strings
    [/[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g, "[REDACTED]"],
    // Password patterns: password = "value", password: value, password="value"
    [/password\s*["'\s:=]+[^\s"']+/gi, "password [REDACTED]"],
];
/**
 * Redact secrets and sensitive patterns from `text`.
 * Returns the scrubbed string; never throws.
 */
export function scrubSensitive(text) {
    let result = text;
    for (const [pattern, replacement] of SCRUB_RULES) {
        result = result.replace(pattern, replacement);
    }
    return result;
}
//# sourceMappingURL=scrub.js.map