import type { CurrentUserDTO } from "@chatty/shared-types";

/** Three choices, so all of them stay on screen rather than behind a dropdown. */
export const PRESENCE_VISIBILITY_OPTIONS: { value: CurrentUserDTO["presenceVisibility"]; label: string }[] = [
	{ value: "everyone", label: "Everyone" },
	{ value: "contacts", label: "People you chat with" },
	{ value: "nobody", label: "Nobody" },
];
