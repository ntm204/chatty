import { BUILTIN_STICKER_KEYS, type BuiltinStickerKey } from "@chatty/shared-types";

/** Whether a message's sticker name is one this client can draw. */
export function isBuiltinStickerKey(key: string | null | undefined): key is BuiltinStickerKey {
	return (BUILTIN_STICKER_KEYS as readonly string[]).includes(key ?? "");
}
