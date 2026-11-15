/** The values of `source` for exactly the keys present in `keysFrom`. */
export function pick<Source extends object>(source: Source, keysFrom: object): Partial<Source> {
	return Object.fromEntries(
		Object.keys(keysFrom).map((key) => [key, source[key as keyof Source]]),
	) as Partial<Source>;
}
