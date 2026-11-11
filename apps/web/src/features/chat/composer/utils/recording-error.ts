export function getRecordingError(error: unknown): string {
	if (!window.isSecureContext) return "Microphone recording requires HTTPS or localhost.";
	if (error instanceof DOMException && error.name === "NotAllowedError") {
		return "Microphone permission was denied. Allow microphone access in your browser settings and try again.";
	}
	if (error instanceof DOMException && error.name === "NotFoundError") {
		return "No microphone was found. Connect a microphone and try again.";
	}
	if (error instanceof DOMException && error.name === "NotReadableError") {
		return "The microphone could not be read. Check your device or close other apps using it, then try again.";
	}

	return "The microphone could not be started. Check your device and try again.";
}
