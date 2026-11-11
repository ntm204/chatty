/**
 * The conversations module's public surface. Callers — the controller, the
 * socket layer, other modules and tests — import from here; the work lives in
 * one `conversations.<sub-domain>.service.ts` per concept, with shared internals
 * in `conversations.shared.ts` and `conversations.mapper.ts`. See
 * docs/conventions/backend.md, "How a module grows".
 */
export { assertParticipant } from "./conversations.shared.js";
export * from "./conversations.inbox.service.js";
export * from "./conversations.self-state.service.js";
export * from "./conversations.customization.service.js";
export * from "./conversations.group-management.service.js";
