/** Match the existing unaccented Vietnamese search contract without changing display text. */
export function foldSearchText(value: string): string {
	return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/gu, "d").toLowerCase();
}
