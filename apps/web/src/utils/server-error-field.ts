import { SERVER_FIELD_ERRORS, type ServerErrorField } from "@/constants/server-field-errors";

/** Which of this form's fields a server error belongs beside, or null to show it under the form. */
export function getServerErrorField<Field extends string>(
	message: string,
	fields: Partial<Record<ServerErrorField, Field>>,
): Field | null {
	const kind = SERVER_FIELD_ERRORS[message];

	return kind ? (fields[kind] ?? null) : null;
}
