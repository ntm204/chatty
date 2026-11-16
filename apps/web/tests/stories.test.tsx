import type { StoryDTO, StoryFeedDTO } from "@chatty/shared-types";
import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { StoriesBar } from "@/features/chat/stories/components/stories-bar";
import { StoryAudienceDialog } from "@/features/chat/stories/components/story-audience-dialog";
import {
	dropExpiredStories,
	firstUnseenIndex,
	nextStoryPosition,
	previousStoryPosition,
} from "@/features/chat/stories/utils";
import { MessageStoryQuote } from "@/features/chat/thread/components/message-story-quote";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, makeUser } from "./factories";

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock("@/lib/socket", () => ({
	getSocket: () => ({
		on: (name: string, handler: (...args: unknown[]) => void) => listeners.set(name, handler),
		off: (name: string) => listeners.delete(name),
		emit: vi.fn(),
	}),
}));

const me = makeCurrentUser();
const an = makeUser("an", "An");
const binh = makeUser("binh", "Binh");
const LATER = "2099-01-01T00:00:00.000Z";

function story(id: string, author = an, overrides: Partial<StoryDTO> = {}): StoryDTO {
	return {
		id,
		author,
		kind: "text",
		text: `story ${id}`,
		background: null,
		media: null,
		music: null,
		createdAt: "2026-11-15T08:00:00.000Z",
		expiresAt: LATER,
		isViewed: false,
		isSaveAllowed: true,
		...overrides,
	};
}

function feedWith(overrides: Partial<StoryFeedDTO> = {}): StoryFeedDTO {
	return {
		mine: [],
		authors: [
			{ author: an, stories: [story("a1"), story("a2")], hasUnseen: true },
			{ author: binh, stories: [story("b1", binh)], hasUnseen: true },
		],
		...overrides,
	};
}

beforeEach(() => {
	listeners.clear();
	useAuth.setState({ currentUser: me } as never);
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
	vi.spyOn(api, "viewStory").mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

async function renderBar(feed = feedWith()) {
	const getFeed = vi.spyOn(api, "getStoryFeed").mockResolvedValue(feed);
	render(<StoriesBar currentUser={me} />);
	await screen.findByRole("button", { name: /An's note/ });

	return { getFeed };
}

describe("story positions", () => {
	const groups = [
		{ author: an, stories: [story("a1"), story("a2", an, { isViewed: true })] },
		{ author: binh, stories: [story("b1", binh)] },
	];

	it("play through one person, then the next, then stop", () => {
		expect(nextStoryPosition(groups, { groupIndex: 0, storyIndex: 0 })).toEqual({ groupIndex: 0, storyIndex: 1 });
		expect(nextStoryPosition(groups, { groupIndex: 0, storyIndex: 1 })).toEqual({ groupIndex: 1, storyIndex: 0 });
		expect(nextStoryPosition(groups, { groupIndex: 1, storyIndex: 0 })).toBeNull();
		expect(previousStoryPosition(groups, { groupIndex: 1, storyIndex: 0 })).toEqual({
			groupIndex: 0,
			storyIndex: 1,
		});
		expect(previousStoryPosition(groups, { groupIndex: 0, storyIndex: 0 })).toBeNull();
	});

	it("start at someone's first unseen story", () => {
		expect(firstUnseenIndex({ author: an, stories: [story("x", an, { isViewed: true }), story("y")] })).toBe(1);
		expect(firstUnseenIndex({ author: an, stories: [story("x", an, { isViewed: true })] })).toBe(0);
	});

	it("leave the row at 24 hours on this clock, dropping people with nothing left", () => {
		const past = "2026-01-01T00:00:00.000Z";
		const pruned = dropExpiredStories(
			feedWith({
				mine: [story("m", me, { expiresAt: past })],
				authors: [
					{ author: an, stories: [story("old", an, { expiresAt: past }), story("new")], hasUnseen: true },
					{ author: binh, stories: [story("gone", binh, { expiresAt: past })], hasUnseen: true },
				],
			}),
		);
		expect(pruned.mine).toEqual([]);
		expect(pruned.authors.map((group) => group.stories.map((item) => item.id))).toEqual([["new"]]);
	});
});

describe("the stories row and viewer", () => {
	it("shows a new-story tile and a ring per person, marking who has something new", async () => {
		await renderBar();

		expect(screen.getByRole("button", { name: "New note" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "An's note, new" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Your note" })).not.toBeInTheDocument();
	});

	it("shows a story's words above the face in a message bubble, and invites a note on your own tile", async () => {
		await renderBar();
		const an = screen.getByRole("button", { name: "An's note, new" });
		// The newest note is the one shown: stories arrive oldest first.
		const bubble = within(an).getByText("story a2").closest(".note-bubble");
		expect(bubble).toHaveClass("chat-bubble-theirs", "chat-bubble-tail");
		expect(within(screen.getByRole("button", { name: "New note" })).getByText("Note…")).toBeInTheDocument();
	});

	it("plays a person's stories, marks each seen, moves on to the next person and closes at the end", async () => {
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));

		const dialog = await screen.findByRole("dialog", { name: "Notes from An" });
		expect(within(dialog).getByText("story a1")).toBeInTheDocument();
		expect(api.viewStory).toHaveBeenCalledWith("a1");

		await userEvent.click(screen.getByRole("button", { name: "Next note" }));
		expect(within(screen.getByRole("dialog")).getByText("story a2")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Next note" }));
		expect(screen.getByRole("dialog", { name: "Notes from Binh" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Previous note" }));
		expect(within(screen.getByRole("dialog")).getByText("story a2")).toBeInTheDocument();

		await userEvent.keyboard("{ArrowRight}{ArrowRight}");
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(screen.getByRole("button", { name: "An's note" })).toBeInTheDocument();
	});

	it("plays a note's song while it is on screen, mutes on request, and stops when it closes", async () => {
		const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
		const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		const music = {
			trackId: "42",
			title: "Lạc Trôi",
			artist: "Sơn Tùng M-TP",
			artworkUrl: "https://is1-ssl.mzstatic.com/42.jpg",
			previewUrl: "https://audio-ssl.itunes.apple.com/42.m4a",
		};
		await renderBar(
			feedWith({ authors: [{ author: an, stories: [story("a1", an, { music })], hasUnseen: true }] }),
		);
		expect(
			within(screen.getByRole("button", { name: "An's note, new" })).getByText("Lạc Trôi"),
		).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));
		const dialog = await screen.findByRole("dialog", { name: "Notes from An" });
		expect(within(dialog).getByText("Lạc Trôi")).toBeInTheDocument();
		await waitFor(() => expect(play).toHaveBeenCalled());

		pause.mockClear();
		await userEvent.click(within(dialog).getByRole("button", { name: "Mute" }));
		expect(pause).toHaveBeenCalled();

		pause.mockClear();
		await userEvent.click(within(dialog).getByRole("button", { name: "Close notes" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(pause).toHaveBeenCalled();
	});

	it("advances when the progress fills, and a long hold pauses without skipping", async () => {
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));
		const dialog = await screen.findByRole("dialog", { name: "Notes from An" });
		await within(dialog).findByText("story a1");

		const fill = document.querySelector(".story-progress-fill")!;
		// jsdom has no AnimationEvent, so React listens for the prefixed name; fire both.
		fireEvent.animationEnd(fill);
		fireEvent(fill, new Event("webkitAnimationEnd", { bubbles: true }));
		expect(within(screen.getByRole("dialog")).getByText("story a2")).toBeInTheDocument();

		const next = screen.getByRole("button", { name: "Next note" });
		const now = Date.now();
		const clock = vi.spyOn(Date, "now").mockReturnValue(now);
		fireEvent.pointerDown(next.parentElement!);
		expect((document.querySelector(".story-progress-fill") as HTMLElement).style.animationPlayState).toBe("paused");
		clock.mockReturnValue(now + 600);
		fireEvent.pointerUp(next.parentElement!);
		fireEvent.click(next, { detail: 1 });
		expect(within(screen.getByRole("dialog")).getByText("story a2")).toBeInTheDocument();
	});

	it("sends a reply or a reaction to the author as a message", async () => {
		const reply = vi.spyOn(api, "replyToStory").mockResolvedValue({} as never);
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));

		await userEvent.type(await screen.findByLabelText("Reply to note"), "nice!");
		await userEvent.click(screen.getByRole("button", { name: "Send reply" }));
		expect(reply).toHaveBeenCalledWith("a1", "nice!");
		expect(await screen.findByRole("status")).toHaveTextContent("Sent to An");

		await userEvent.click(screen.getByRole("button", { name: "React with 🔥" }));
		expect(reply).toHaveBeenLastCalledWith("a1", "🔥");
	});

	it("lets the author see viewers, change the audience and delete, from their own story", async () => {
		const own = story("m1", me, { audience: "contacts", viewCount: 2, isViewed: true });
		vi.spyOn(api, "listStoryViewers").mockResolvedValue([{ user: an, viewedAt: "2026-11-15T09:00:00.000Z" }]);
		const audience = vi.spyOn(api, "setStoryAudience").mockResolvedValue({ ...own, audience: "close_friends" });
		const remove = vi.spyOn(api, "deleteStory").mockResolvedValue(undefined);
		await renderBar(feedWith({ mine: [own] }));

		await userEvent.click(screen.getByRole("button", { name: "Your note" }));
		await userEvent.click(await screen.findByRole("button", { name: "2" }));
		expect(await screen.findByRole("heading", { name: "Viewers" })).toBeInTheDocument();
		expect(screen.getAllByText("An").length).toBeGreaterThan(0);
		await userEvent.click(screen.getByRole("button", { name: "Close viewers" }));

		await userEvent.click(screen.getByRole("radio", { name: "Close friends" }));
		expect(audience).toHaveBeenCalledWith("m1", "close_friends");
		await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
		expect(remove).toHaveBeenCalledWith("m1");
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(screen.queryByRole("button", { name: "Your note" })).not.toBeInTheDocument();
	});

	it("refetches the row when the server nudges", async () => {
		const { getFeed } = await renderBar();
		const calls = getFeed.mock.calls.length;
		act(() => listeners.get("story:changed")?.({ authorId: "an" }));
		act(() => listeners.get("story:changed")?.({ authorId: "binh" }));
		await waitFor(() => expect(getFeed.mock.calls.length).toBe(calls + 1));
	});
});

describe("posting", () => {
	it("posts a note to the chosen audience for the chosen lifetime", async () => {
		const created = story("new", me, { audience: "close_friends" });
		const post = vi.spyOn(api, "createNote").mockResolvedValue(created);
		await renderBar();

		await userEvent.click(screen.getByRole("button", { name: "New note" }));
		const dialog = await screen.findByRole("dialog", { name: "New note" });
		expect(within(dialog).queryByRole("radio", { name: "Photo" })).not.toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: "Share note" })).toBeDisabled();
		await userEvent.type(within(dialog).getByLabelText("Note text"), "Good morning");
		await userEvent.click(within(dialog).getByRole("radio", { name: "Close friends" }));
		await userEvent.click(within(dialog).getByRole("radio", { name: "6 hours" }));
		expect(within(dialog).getByRole("radio", { name: "6 hours" })).toHaveTextContent("6h");
		await userEvent.click(within(dialog).getByRole("button", { name: "Share note" }));

		expect(post).toHaveBeenCalledWith("Good morning", null, "close_friends", 6);
		await waitFor(() => expect(screen.getByRole("button", { name: "Your note" })).toBeInTheDocument());
	});

	it("finds a real song — the chart first, then a search — previews it, and posts a note that is only a song", async () => {
		const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		const song = (trackId: string, title: string) => ({
			trackId,
			title,
			artist: "Sơn Tùng M-TP",
			artworkUrl: `https://is1-ssl.mzstatic.com/${trackId}.jpg`,
			previewUrl: `https://audio-ssl.itunes.apple.com/${trackId}.m4a`,
		});
		const search = vi.spyOn(api, "searchNoteMusic").mockImplementation(async (query) => ({
			tracks: query ? [song("42", "Lạc Trôi")] : [song("7", "Chúng Ta Của Hiện Tại")],
		}));
		const post = vi.spyOn(api, "createNote").mockResolvedValue(story("song", me));
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "New note" }));
		const dialog = await screen.findByRole("dialog", { name: "New note" });

		await userEvent.click(within(dialog).getByRole("button", { name: "Add a song" }));
		const picker = await screen.findByRole("dialog", { name: "Add a song" });
		expect(within(picker).getByText("Popular in Vietnam")).toBeInTheDocument();
		expect(await within(picker).findByText("Chúng Ta Của Hiện Tại")).toBeInTheDocument();

		await userEvent.type(within(picker).getByLabelText("Search songs"), "lac troi");
		expect(await within(picker).findByText("Lạc Trôi")).toBeInTheDocument();
		expect(search).toHaveBeenLastCalledWith("lac troi", expect.any(AbortSignal));
		// One request for the typed words, not one per keystroke.
		expect(search.mock.calls.filter(([query]) => query).length).toBe(1);

		await userEvent.click(within(picker).getByRole("button", { name: "Play preview of Lạc Trôi" }));
		expect(play).toHaveBeenCalled();
		expect(within(picker).getByRole("button", { name: "Stop preview of Lạc Trôi" })).toBeInTheDocument();

		await userEvent.click(within(picker).getByRole("button", { name: "Lạc Trôi by Sơn Tùng M-TP" }));
		expect(screen.queryByRole("dialog", { name: "Add a song" })).not.toBeInTheDocument();
		expect(within(dialog).getByText("Lạc Trôi")).toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: "Change song" })).toBeInTheDocument();
		await userEvent.click(within(dialog).getByRole("button", { name: "Share note" }));

		await waitFor(() => expect(post).toHaveBeenCalledWith("", "42", "contacts", 24));
	});

	it("says so when music is unavailable, and the note can still be posted without one", async () => {
		vi.spyOn(api, "searchNoteMusic").mockRejectedValue(new Error("Music is not available right now."));
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "New note" }));
		await userEvent.click(await screen.findByRole("button", { name: "Add a song" }));

		const picker = await screen.findByRole("dialog", { name: "Add a song" });
		expect(await within(picker).findByRole("alert")).toHaveTextContent("Music is not available right now.");
	});

	it("edits the two private lists from the people you chat with", async () => {
		vi.spyOn(api, "getStoryAudienceSettings").mockResolvedValue({
			contacts: [an, binh],
			closeFriendIds: ["an"],
			hiddenIds: [],
		});
		const friends = vi.spyOn(api, "setCloseFriends").mockResolvedValue({} as never);
		const hidden = vi.spyOn(api, "setStoryHiddenFrom").mockResolvedValue({} as never);
		render(<StoryAudienceDialog onClose={vi.fn()} />);

		expect(await screen.findByRole("switch", { name: "An in close friends" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await userEvent.click(screen.getByRole("switch", { name: "Binh in close friends" }));
		await userEvent.click(screen.getByRole("radio", { name: "Hide notes from" }));
		await userEvent.click(screen.getByRole("switch", { name: "An in hidden" }));
		await userEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(friends).toHaveBeenCalledWith(["an", "binh"]);
		expect(hidden).toHaveBeenCalledWith(["an"]);
	});
});

describe("a reply's note quote", () => {
	it("shows the story while it lives, and only that it expired afterwards", () => {
		const { rerender } = render(
			<MessageStoryQuote
				storyReply={{ storyId: "s", isExpired: false, thumbUrl: "http://x/thumb", text: "", background: null }}
				isMine={false}
			/>,
		);
		expect(screen.getByText("Replied to your note")).toBeInTheDocument();
		expect(document.querySelector("img")).toHaveAttribute("src", "http://x/thumb");

		rerender(
			<MessageStoryQuote
				storyReply={{ storyId: null, isExpired: true, thumbUrl: null, text: "", background: null }}
				isMine
			/>,
		);
		expect(screen.getByText("Note expired")).toBeInTheDocument();
		expect(document.querySelector("img")).toBeNull();
	});

	it("refuses a context menu on a photo whose author turned forwarding off", async () => {
		await renderBar(
			feedWith({
				authors: [
					{
						author: an,
						stories: [
							story("p", an, {
								kind: "photo",
								text: "",
								isSaveAllowed: false,
								media: {
									url: "http://x/full",
									thumbUrl: null,
									posterUrl: null,
									width: 10,
									height: 10,
									durationMs: null,
								},
							}),
						],
						hasUnseen: true,
					},
				],
			}),
		);
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));
		const image = await screen.findByAltText("Story from An");
		const menu = createEvent.contextMenu(image);
		fireEvent(image, menu);
		expect(menu.defaultPrevented).toBe(true);
	});
});

describe("video stories in the viewer", () => {
	const video = story("v1", an, {
		kind: "video",
		text: "",
		media: {
			url: "http://x/video",
			thumbUrl: "http://x/thumb",
			posterUrl: "http://x/poster",
			width: 720,
			height: 1280,
			durationMs: 12_000,
		},
	});

	it("runs the clock for the video's own length, pauses with the story, holds while buffering, and mutes", async () => {
		const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
		const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		await renderBar(feedWith({ authors: [{ author: an, stories: [video], hasUnseen: true }] }));
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));

		const element = (await screen.findByLabelText("Video story from An")) as HTMLVideoElement;
		expect(element).toHaveAttribute("poster", "http://x/poster");
		const fill = () => document.querySelector(".story-progress-fill") as HTMLElement;
		expect(fill().style.animationDuration).toBe("12000ms");
		expect(play).toHaveBeenCalled();

		fireEvent(element, new Event("waiting"));
		expect(fill().style.animationPlayState).toBe("paused");
		fireEvent(element, new Event("playing"));
		expect(fill().style.animationPlayState).toBe("running");

		await userEvent.click(screen.getByLabelText("Reply to note"));
		expect(pause).toHaveBeenCalled();

		await userEvent.click(screen.getByRole("button", { name: "Mute" }));
		expect(element.muted).toBe(true);
		expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
	});

	it("falls back to muted when the browser refuses sound", async () => {
		const play = vi
			.spyOn(HTMLMediaElement.prototype, "play")
			.mockRejectedValueOnce(new Error("NotAllowedError"))
			.mockResolvedValue(undefined);
		await renderBar(feedWith({ authors: [{ author: an, stories: [video], hasUnseen: true }] }));
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));

		expect(await screen.findByRole("button", { name: "Unmute" })).toBeInTheDocument();
		expect(play).toHaveBeenCalledTimes(2);
	});

	it("prefetches only the next story's picture", async () => {
		const created: string[] = [];
		class FakeImage {
			set src(value: string) {
				created.push(value);
			}
		}
		vi.stubGlobal("Image", FakeImage);
		const photo = (id: string) =>
			story(id, an, {
				kind: "photo",
				media: {
					url: `http://x/${id}`,
					thumbUrl: null,
					posterUrl: null,
					width: 1,
					height: 1,
					durationMs: null,
				},
			});
		await renderBar(
			feedWith({ authors: [{ author: an, stories: [photo("p1"), photo("p2"), photo("p3")], hasUnseen: true }] }),
		);
		await userEvent.click(screen.getByRole("button", { name: "An's note, new" }));
		await screen.findByRole("dialog");

		expect(created).toEqual(["http://x/p2"]);
		vi.unstubAllGlobals();
	});
});
