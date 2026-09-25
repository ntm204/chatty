import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { CONNECTION_WARNING_DELAY_MS } from "../constants/connection";

/**
 * Whether the socket is currently down, and a callback for when it comes back.
 *
 * Both halves exist because a dropped socket is silent. Nothing in this app
 * polls, so between the drop and the reconnect the screen keeps rendering the
 * last thing it heard — a sidebar and a thread that are quietly out of date with
 * no sign that anything is missing.
 *
 * `onReconnect` fires only on a *re*connection, never on the first one: the
 * initial connect happens alongside the fetches that populate the screen, and
 * resyncing then would repeat them.
 *
 * The returned flag is delayed by `CONNECTION_WARNING_DELAY_MS` rather than
 * following `socket.connected` exactly — see that constant.
 */
export function useSocketConnection(onReconnect: () => void): boolean {
	const [isConnectionLost, setIsConnectionLost] = useState(false);
	// The callback changes identity on most renders; the listener must not.
	const onReconnectRef = useRef(onReconnect);
	onReconnectRef.current = onReconnect;

	useEffect(() => {
		const socket = getSocket();
		let warningTimer: ReturnType<typeof setTimeout> | undefined;
		// Distinguishes "has not connected yet" from "was connected and dropped".
		// A failed first connection also needs resync: startup may have used only
		// locally cached messages with inert media placeholders.
		let hasConnected = socket.connected;
		let hasMissedInitialLoad = !navigator.onLine;
		const handleConnectionError = () => {
			hasMissedInitialLoad = true;
		};
		const handleOnline = () => {
			if (!socket.connected) socket.connect();
		};

		function handleConnect() {
			clearTimeout(warningTimer);
			setIsConnectionLost(false);

			if (hasConnected || hasMissedInitialLoad) onReconnectRef.current();
			hasConnected = true;
			hasMissedInitialLoad = false;
		}

		function handleDisconnect() {
			clearTimeout(warningTimer);
			warningTimer = setTimeout(() => setIsConnectionLost(true), CONNECTION_WARNING_DELAY_MS);
		}

		socket.on("connect", handleConnect);
		socket.on("disconnect", handleDisconnect);
		socket.on("connect_error", handleConnectionError);
		window.addEventListener("online", handleOnline);

		// The socket is shared and may already have connected before this mounted,
		// in which case no "connect" event is coming and waiting for one would leave
		// the banner armed forever.
		if (!socket.connected) handleDisconnect();

		return () => {
			clearTimeout(warningTimer);
			socket.off("connect", handleConnect);
			socket.off("disconnect", handleDisconnect);
			socket.off("connect_error", handleConnectionError);
			window.removeEventListener("online", handleOnline);
		};
	}, []);

	return isConnectionLost;
}
