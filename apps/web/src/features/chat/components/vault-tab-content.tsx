import type { AttachmentWithMessageDTO, MessageLinkDTO } from "@chatty/shared-types";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/button";
import { MONTH_HEADING_CLASS, type VaultTab } from "../constants/vault";
import { getAttachmentPreviewUrl } from "../utils";
import { formatLinkSource, formatVaultDate, groupVaultByMonth } from "../utils/vault";
import { AttachmentLightbox } from "./attachment-lightbox";
import { MessageFileCard } from "./message-file-card";
import { VaultEmptyState } from "./vault-empty-state";
import { VoicePlayer } from "./voice-player";

interface VaultTabContentProps {
	activeTab: Exclude<VaultTab, "members">;
	attachments: AttachmentWithMessageDTO[];
	links: MessageLinkDTO[];
	isLoading: boolean;
	error: string;
	hasMore: boolean;
	nextCursor: string | undefined;
	loadMoreRef: RefObject<HTMLDivElement>;
	onLoadPage: (before?: string, replace?: boolean) => Promise<void>;
	onOpenMessage: (messageId: string) => void;
}

export function VaultTabContent({
	activeTab,
	attachments,
	links,
	isLoading,
	error,
	hasMore,
	nextCursor,
	loadMoreRef,
	onLoadPage,
	onOpenMessage,
}: VaultTabContentProps) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	// Every list carries the same heading, because every one of them answers
	// "when was this shared?" — and a month is the only handle a hundred rows of
	// files, voice notes or links can be aimed at.
	const attachmentGroups = useMemo(
		() => groupVaultByMonth(attachments, (attachment) => attachment.messageCreatedAt),
		[attachments],
	);
	const linkGroups = useMemo(() => groupVaultByMonth(links, (link) => link.createdAt), [links]);
	const isEmpty = activeTab === "links" ? links.length === 0 : attachments.length === 0;

	return (
		<>
			{isLoading && isEmpty && <p className="eyebrow text-ink-faint">Loading…</p>}
			{error && (
				<div className="flex items-center justify-between gap-3">
					<p role="alert" className="eyebrow text-signal">
						{error}
					</p>
					<Button variant="ghost" onClick={() => void onLoadPage(nextCursor, isEmpty)} className="px-2">
						Retry
					</Button>
				</div>
			)}
			{!isLoading && isEmpty && !hasMore && !error && <VaultEmptyState tab={activeTab} />}

			{activeTab === "media" && (
				<div className="flex flex-col gap-5">
					{attachmentGroups.map(([month, items]) => (
						<section key={month}>
							<h3 className={MONTH_HEADING_CLASS}>{month}</h3>
							<div className="grid grid-cols-3 gap-1">
								{items.map((attachment) => (
									<Button
										key={attachment.id}
										variant="ghost"
										onClick={() =>
											setLightboxIndex(attachments.findIndex((item) => item.id === attachment.id))
										}
										className="aspect-square overflow-hidden rounded-sm p-0"
									>
										<img
											src={getAttachmentPreviewUrl(attachment)}
											alt={`Shared by ${attachment.authorName ?? "Deleted account"}`}
											className="size-full object-cover"
										/>
									</Button>
								))}
							</div>
						</section>
					))}
				</div>
			)}

			{(activeTab === "files" || activeTab === "voice") && (
				<div className="flex flex-col gap-5">
					{attachmentGroups.map(([month, items]) => (
						<section key={month}>
							<h3 className={MONTH_HEADING_CLASS}>{month}</h3>
							<div className="flex flex-col gap-3">
								{items.map((attachment) => (
									<div key={attachment.id}>
										{activeTab === "files" ? (
											<MessageFileCard attachment={attachment} className="w-full max-w-none" />
										) : (
											<VoicePlayer attachment={attachment} className="w-full max-w-none" />
										)}
										<p className="meta mt-1 px-1 text-ink-faint">
											{attachment.authorName ?? "Deleted account"} ·{" "}
											{formatVaultDate(attachment.messageCreatedAt)}
										</p>
									</div>
								))}
							</div>
						</section>
					))}
				</div>
			)}

			{activeTab === "links" && (
				<div className="flex flex-col gap-5">
					{linkGroups.map(([month, items]) => (
						<section key={month}>
							<h3 className={MONTH_HEADING_CLASS}>{month}</h3>
							<div className="flex flex-col gap-3">
								{items.map((link) => (
									<Button
										key={link.id}
										variant="ghost"
										onClick={() => onOpenMessage(link.messageId)}
										className="block min-w-0 text-left"
									>
										<span className="meta block truncate text-ink-soft">
											{formatLinkSource(link.url)}
										</span>
										<span className="block truncate text-sm text-ink">{link.url}</span>
										<span className="meta mt-1 block text-ink-faint">
											{link.authorName ?? "Deleted account"} · {formatVaultDate(link.createdAt)}
										</span>
									</Button>
								))}
							</div>
						</section>
					))}
				</div>
			)}

			{hasMore && !isLoading && (
				<Button
					variant="outline"
					onClick={() => void onLoadPage(nextCursor)}
					disabled={!nextCursor}
					className="mt-4 w-full"
				>
					Load more
				</Button>
			)}
			<div ref={loadMoreRef} aria-hidden="true" className="h-px" />
			{isLoading && !isEmpty && <p className="eyebrow py-3 text-center text-ink-faint">Loading more…</p>}

			{lightboxIndex !== null && (
				<AttachmentLightbox
					key={attachments[lightboxIndex]?.id}
					attachments={attachments}
					initialIndex={lightboxIndex}
					// No caption: the vault lists attachments rather than the messages
					// they came with, so there is no text to state — and the viewer's
					// caption line is now type above the picture, where a stand-in
					// label would read as this picture's own words.
					caption=""
					onClose={() => setLightboxIndex(null)}
					onOpenMessage={(attachment) => {
						setLightboxIndex(null);
						const item = attachments.find((candidate) => candidate.id === attachment.id);
						if (item) onOpenMessage(item.messageId);
					}}
				/>
			)}
		</>
	);
}
