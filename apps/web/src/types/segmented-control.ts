/** One choice on a `SegmentedControl`. */
export interface SegmentedOption<Value> {
	value: Value;
	label: string;
	/** The spoken name when `label` is an abbreviation ("24h" → "24 hours"). */
	accessibleLabel?: string;
}
