/** Hover time before an icon's name appears, and the window in which the next one appears at once. */
export const TOOLTIP_DELAY_MS = 400;
export const TOOLTIP_WARM_MS = 300;
/** Gap between a control and its tooltip, and the closest a tooltip may sit to the window edge. */
export const TOOLTIP_GAP_PX = 6;
export const TOOLTIP_EDGE_PX = 8;
/** Controls that may get an automatic tooltip; the layer still skips any with visible text. */
export const TOOLTIP_TARGET_SELECTOR = "button[aria-label], a[aria-label], [data-tooltip]";
