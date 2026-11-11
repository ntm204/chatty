/**
 * The messages module's public surface. Callers — the controller, the socket
 * layer and tests — import from here; the work lives in one
 * `messages.<sub-domain>.service.ts` per concept, sharing `messages.mapper.ts`.
 * See docs/conventions/backend.md, "How a module grows".
 */
export * from "./messages.send.service.js";
export * from "./messages.history.service.js";
export * from "./messages.annotations.service.js";
export * from "./messages.editing.service.js";
