export function getRecordingError(error: unknown): string {
	if (!window.isSecureContext) return "Microphone recording requires HTTPS or localhost.";
	if (error instanceof DOMException && error.name === "NotAllowedError") return "Microphone permission was denied.";
	if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone was found.";
	if (error instanceof DOMException && error.name === "NotReadableError") return "The microphone is already in use.";

	return "The microphone could not be started.";
}
