import type { CurrentUserDTO } from "@chatty/shared-types";
import type { RadioListOption } from "@/types/radio-list";

/** Who sees when you were last active — Messenger's "Active status", with what each choice means. */
export const PRESENCE_VISIBILITY_OPTIONS: RadioListOption<CurrentUserDTO["presenceVisibility"]>[] = [
	{ value: "everyone", label: "Everyone", description: "Anyone who can find you sees when you were last active." },
	{ value: "contacts", label: "People you chat with", description: "Only people you share a chat with." },
	{ value: "nobody", label: "Nobody", description: "You won't see when others were last active either." },
];
