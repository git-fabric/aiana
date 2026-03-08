/**
 * @git-fabric/aiana — FabricApp factory
 *
 * Implements the FabricApp interface from @git-fabric/gateway.
 * Exposes all memory, session, preference, feedback, and status
 * operations as a single composable layer.
 *
 * Tools (11 total):
 *   Memory   : aiana_memory_search, aiana_memory_add, aiana_memory_recall,
 *              aiana_memory_delete, aiana_memory_export, aiana_memory_import
 *   Sessions : aiana_session_list
 *   Prefs    : aiana_preference_add
 *   Feedback : aiana_memory_feedback
 *   Status   : aiana_status, aiana_health
 */
import type { AianaAdapter, FabricApp } from "./types.js";
export declare function createApp(adapterOverride?: AianaAdapter): FabricApp;
//# sourceMappingURL=app.d.ts.map