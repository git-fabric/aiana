/**
 * @git-fabric/aiana — scrub layer
 *
 * Removes PII and secrets from text before it is embedded or stored.
 * All replacements are idempotent and safe to call multiple times.
 */
/**
 * Redact secrets and sensitive patterns from `text`.
 * Returns the scrubbed string; never throws.
 */
export declare function scrubSensitive(text: string): string;
//# sourceMappingURL=scrub.d.ts.map