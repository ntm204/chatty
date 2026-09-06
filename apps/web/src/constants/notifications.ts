/**
 * Where the per-device notification choice is kept.
 *
 * `localStorage`, not the account. Permission to show a notification is granted
 * by one browser on one machine, so a server-synced preference would claim
 * something it cannot deliver: switching it on at the desk would leave the
 * phone saying notifications are on while its browser has never been asked.
 *
 * In `src/constants` rather than a feature's, because the chat raises the
 * notifications and the settings dialog turns them on — two features, so it
 * belongs to neither.
 */
export const NOTIFICATIONS_STORAGE_KEY = "chatty:notifications";

/**
 * Unlike the popup preference, sound needs no browser permission — so it
 * defaults to on rather than requiring an explicit first opt-in.
 */
export const SOUND_STORAGE_KEY = "chatty:notification-sound";
