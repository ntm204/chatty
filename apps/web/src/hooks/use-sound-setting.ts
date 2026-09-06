import { create } from "zustand";
import { SOUND_STORAGE_KEY } from "@/constants/notifications";

interface SoundSettingState {
	isEnabled: boolean;
	enable: () => void;
	disable: () => void;
}

function readStoredPreference(): boolean {
	try {
		const stored = localStorage.getItem(SOUND_STORAGE_KEY);
		// No stored value yet means never turned off — default on.
		return stored === null ? true : stored === "true";
	} catch {
		return true;
	}
}

function writeStoredPreference(value: boolean): void {
	try {
		localStorage.setItem(SOUND_STORAGE_KEY, String(value));
	} catch {
		// Lost at the end of the session; the setting still applies now.
	}
}

/** Whether an arriving message plays a chime. Separate from `useNotificationSetting`: this needs no browser permission. */
export const useSoundSetting = create<SoundSettingState>((set) => ({
	isEnabled: readStoredPreference(),
	enable() {
		writeStoredPreference(true);
		set({ isEnabled: true });
	},
	disable() {
		writeStoredPreference(false);
		set({ isEnabled: false });
	},
}));
