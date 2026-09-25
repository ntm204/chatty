import { useEffect, useRef, useState } from "react";
import type { AttachmentDTO } from "@chatty/shared-types";
import { api } from "@/api/client";
import { isOfflineMediaUrl } from "@/utils/is-offline-media-url";

/** Only an explicit retry renews access; changing images invalidates pending results. */
export function useImageRecovery(attachment: AttachmentDTO | undefined) {
	const scope = `${attachment?.id}:${attachment?.url}`;
	const scopeRef = useRef(scope);
	scopeRef.current = scope;
	const requestRef = useRef<object | null>(null);
	const [state, setState] = useState({ scope, url: attachment?.url, error: "", isRetrying: false, attempt: 0 });
	const current =
		state.scope === scope ? state : { scope, url: attachment?.url, error: "", isRetrying: false, attempt: 0 };
	useEffect(() => {
		requestRef.current = null;
		setState({ scope, url: attachment?.url, error: "", isRetrying: false, attempt: 0 });

		return () => {
			requestRef.current = null;
		};
	}, [scope, attachment?.url]);

	function fail() {
		if (!attachment || isOfflineMediaUrl(attachment.url)) return;
		setState({ ...current, error: "This image could not be loaded. Retry to check access and load it again." });
	}

	async function retry() {
		if (!attachment || isOfflineMediaUrl(attachment.url) || requestRef.current) return;
		const request = {};
		requestRef.current = request;
		setState({ ...current, isRetrying: true });
		try {
			const fresh = await api.getAttachmentUrls(attachment.id);
			if (requestRef.current !== request || scopeRef.current !== scope) return;
			setState({ scope, url: fresh.url, error: "", isRetrying: false, attempt: current.attempt + 1 });
		} catch {
			if (requestRef.current === request && scopeRef.current === scope)
				setState({
					...current,
					isRetrying: false,
					error: "This image is unavailable or access could not be checked. Check your connection and retry.",
				});
		} finally {
			if (requestRef.current === request) requestRef.current = null;
		}
	}

	return { ...current, fail, retry };
}
