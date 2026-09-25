import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { downloadAttachment } from "@/features/chat/utils/download-attachment";
import { makeAttachment } from "./factories";

vi.mock("@/api/client", () => ({ api: { getAttachmentUrls: vi.fn() } }));

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("fetch", vi.fn());
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.runAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("authorized attachment download recovery", () => {
	it("renews an expired URL once and releases the downloaded blob", async () => {
		const attachment = makeAttachment();
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
		vi.mocked(api.getAttachmentUrls).mockResolvedValueOnce({ url: "https://example.com/fresh", thumbUrl: null });
		vi.mocked(fetch).mockResolvedValueOnce(new Response("file bytes"));
		await downloadAttachment(attachment);
		expect(api.getAttachmentUrls).toHaveBeenCalledWith(attachment.id);
		expect(fetch).toHaveBeenNthCalledWith(2, "https://example.com/fresh");
		expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
		vi.runAllTimers();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
	});

	it("does not revive media when authorization renewal is denied", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
		vi.mocked(api.getAttachmentUrls).mockRejectedValueOnce(new Error("Attachment no longer available"));
		await expect(downloadAttachment(makeAttachment())).rejects.toThrow("no longer available");
		expect(fetch).toHaveBeenCalledOnce();
		expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
	});

	it("does not repeatedly renew a URL that remains unavailable", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
		vi.mocked(api.getAttachmentUrls).mockResolvedValueOnce({ url: "https://example.com/fresh", thumbUrl: null });
		await expect(downloadAttachment(makeAttachment())).rejects.toThrow("403");
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(api.getAttachmentUrls).toHaveBeenCalledOnce();
	});
});
