import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useChatViewport } from "@/features/chat/hooks/use-chat-viewport";

afterEach(() => vi.unstubAllGlobals());

it("follows keyboard height and pan, leaves pinch zoom alone and removes listeners on unmount", () => {
	const viewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0, scale: 1 });
	vi.stubGlobal("visualViewport", viewport);
	const shell = document.createElement("div");
	const { unmount } = renderHook(() => useChatViewport({ current: shell }));
	expect(shell.style.getPropertyValue("--chat-viewport-height")).toBe("812px");

	viewport.height = 360;
	viewport.dispatchEvent(new Event("resize"));
	viewport.offsetTop = 55;
	viewport.dispatchEvent(new Event("scroll"));
	expect(shell.style.getPropertyValue("--chat-viewport-height")).toBe("360px");
	expect(shell.style.getPropertyValue("--chat-viewport-top")).toBe("55px");

	viewport.scale = 2;
	viewport.height = 180;
	viewport.offsetTop = 120;
	viewport.dispatchEvent(new Event("resize"));
	expect(shell.style.getPropertyValue("--chat-viewport-height")).toBe("360px");
	expect(shell.style.getPropertyValue("--chat-viewport-top")).toBe("55px");

	viewport.scale = 1;
	viewport.height = 812;
	viewport.offsetTop = 0;
	viewport.dispatchEvent(new Event("resize"));
	expect(shell.style.getPropertyValue("--chat-viewport-height")).toBe("812px");
	unmount();
	viewport.dispatchEvent(new Event("resize"));
	expect(shell.style.getPropertyValue("--chat-viewport-height")).toBe("");
	expect(shell.style.getPropertyValue("--chat-viewport-top")).toBe("");
});

it("keeps the CSS viewport fallback when VisualViewport is unavailable", () => {
	vi.stubGlobal("visualViewport", undefined);
	const shell = document.createElement("div");
	renderHook(() => useChatViewport({ current: shell }));
	expect(shell.getAttribute("style")).toBeNull();
});
