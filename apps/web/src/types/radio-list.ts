/** One choice in a `RadioList`: its words, and an optional line saying what it means. */
export interface RadioListOption<Value> {
	value: Value;
	label: string;
	description?: string;
}
