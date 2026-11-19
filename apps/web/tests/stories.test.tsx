import type { StoryDTO, StoryFeedDTO } from "@chatty/shared-types";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { NotesBar } from "@/features/chat/stories/components/notes-bar";
import { StoryAudienceDialog } from "@/features/chat/stories/components/story-audience-dialog";
import { dropExpiredStories, latestNotes } from "@/features/chat/stories/utils";
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
		text: `note ${id}`,
		background: null,
		media: null,
		music: null,
		createdAt: "2026-11-15T08:00:00.000Z",
		expiresAt: LATER,
		isViewed: false,
		isSaveAllowed: true,
		isLiked: false,
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
	render(<NotesBar currentUser={me} />);
	await screen.findByRole("button", { name: /An's note/ });

	return { getFeed };
}

describe("the notes row", () => {
	it("leaves the row at 24 hours on this clock, dropping people with nothing left", () => {
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

	it("shows one note per person, newest first", () => {
		const notes = latestNotes([
			{
				author: an,
				stories: [story("a1", an, { createdAt: "2026-11-15T07:00:00.000Z" }), story("a2")],
				hasUnseen: true,
			},
			{ author: binh, stories: [story("b1", binh, { createdAt: "2026-11-15T09:00:00.000Z" })], hasUnseen: true },
		]);
		expect(notes.map((note) => note.id)).toEqual(["b1", "a2"]);
	});

	it("puts your tile first with a thought bubble invitation, then each person's note above their face", async () => {
		await renderBar();
		const tiles = within(screen.getByRole("group", { name: "Notes" })).getAllByRole("button");
		expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual(["New note", "An's note", "Binh's note"]);
		expect(within(tiles[0]!).getByText("Note…")).toBeInTheDocument();
		expect(within(tiles[1]!).getByText("note a2").closest(".note-thought-bubble")).not.toBeNull();
		expect(within(tiles[1]!).queryByText("note a1")).not.toBeInTheDocument();
	});

	it("refetches the row when the server nudges", async () => {
		const { getFeed } = await renderBar();
		const calls = getFeed.mock.calls.length;
		act(() => listeners.get("story:changed")?.({ authorId: "an" }));
		act(() => listeners.get("story:changed")?.({ authorId: "binh" }));
		await waitFor(() => expect(getFeed.mock.calls.length).toBe(calls + 1));
	});
});

describe("someone's note", () => {
	it("opens in a sheet, marks it seen, and a heart likes it at once — tapping again unlikes", async () => {
		const like = vi.spyOn(api, "likeStory").mockResolvedValue(undefined);
		const unlike = vi.spyOn(api, "unlikeStory").mockResolvedValue(undefined);
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "An's note" }));

		const sheet = await screen.findByRole("dialog", { name: "An's note" });
		expect(within(sheet).getByText("note a2")).toBeInTheDocument();
		expect(api.viewStory).toHaveBeenCalledWith("a2");
		await userEvent.click(within(sheet).getByRole("button", { name: "Like note" }));
		expect(like).toHaveBeenCalledWith("a2");
		expect(within(sheet).getByRole("button", { name: "Unlike note" })).toHaveAttribute("aria-pressed", "true");
		await userEvent.click(within(sheet).getByRole("button", { name: "Unlike note" }));
		expect(unlike).toHaveBeenCalledWith("a2");
		expect(within(sheet).getByRole("button", { name: "Like note" })).toBeInTheDocument();
	});

	it("takes the heart back if the server refuses it", async () => {
		vi.spyOn(api, "likeStory").mockRejectedValue(new Error("gone"));
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "An's note" }));
		const sheet = await screen.findByRole("dialog", { name: "An's note" });
		await userEvent.click(within(sheet).getByRole("button", { name: "Like note" }));
		await waitFor(() => expect(within(sheet).getByRole("button", { name: "Like note" })).toBeInTheDocument());
	});

	it("turns the heart into send while typing, and the reply goes to the author as a message", async () => {
		const reply = vi.spyOn(api, "replyToStory").mockResolvedValue({} as never);
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "An's note" }));
		const sheet = await screen.findByRole("dialog", { name: "An's note" });

		await userEvent.type(within(sheet).getByLabelText("Reply to note"), "haha same");
		expect(within(sheet).queryByRole("button", { name: "Like note" })).not.toBeInTheDocument();
		await userEvent.click(within(sheet).getByRole("button", { name: "Send reply" }));
		expect(reply).toHaveBeenCalledWith("a2", "haha same");
		expect(await within(sheet).findByRole("status")).toHaveTextContent("Sent to An");
		expect(within(sheet).getByRole("button", { name: "Like note" })).toBeInTheDocument();
	});

	it("plays the note's song while open and stops it on close", async () => {
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
		expect(within(screen.getByRole("button", { name: "An's note" })).getByText("Lạc Trôi")).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "An's note" }));
		const sheet = await screen.findByRole("dialog", { name: "An's note" });
		await waitFor(() => expect(play).toHaveBeenCalled());
		pause.mockClear();
		await userEvent.click(within(sheet).getByRole("button", { name: "Close note" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(pause).toHaveBeenCalled();
	});
});

describe("your note", () => {
	const mine = story("m1", me, { text: "đi cà phê không", audience: "contacts", likeCount: 1 });

	it("shows who liked it and lets you leave a new note or delete it", async () => {
		vi.spyOn(api, "listStoryLikes").mockResolvedValue([{ user: an, likedAt: "2026-11-15T09:00:00.000Z" }]);
		const remove = vi.spyOn(api, "deleteStory").mockResolvedValue(undefined);
		await renderBar(feedWith({ mine: [mine] }));

		const tile = screen.getByRole("button", { name: "Your note" });
		expect(within(tile).getByText("đi cà phê không")).toBeInTheDocument();
		await userEvent.click(tile);
		const sheet = await screen.findByRole("dialog", { name: "Your note" });
		expect(within(sheet).getByText("Shared with people you chat with")).toBeInTheDocument();
		expect(await within(sheet).findByText("Liked by 1")).toBeInTheDocument();
		expect(within(sheet).getByText("An")).toBeInTheDocument();

		await userEvent.click(within(sheet).getByRole("button", { name: "Leave a new note" }));
		const composer = await screen.findByRole("dialog", { name: "New note" });
		expect(within(composer).getByText(/It replaces your current note/)).toBeInTheDocument();
		await userEvent.click(within(composer).getByRole("button", { name: "Close new note" }));

		await userEvent.click(screen.getByRole("button", { name: "Your note" }));
		const again = await screen.findByRole("dialog", { name: "Your note" });
		await userEvent.click(within(again).getByRole("button", { name: "Delete note" }));
		const confirm = await screen.findByRole("dialog", { name: "Delete note?" });
		await userEvent.click(within(confirm).getByRole("button", { name: "Delete note" }));
		expect(remove).toHaveBeenCalledWith("m1");
		await waitFor(() => expect(screen.getByRole("button", { name: "New note" })).toBeInTheDocument());
	});
});

describe("posting", () => {
	it("posts a note of up to 60 characters to the chosen audience, and it takes your tile", async () => {
		const post = vi.spyOn(api, "createNote").mockResolvedValue(story("new", me, { text: "Good morning" }));
		await renderBar();

		await userEvent.click(screen.getByRole("button", { name: "New note" }));
		const dialog = await screen.findByRole("dialog", { name: "New note" });
		expect(within(dialog).getByRole("button", { name: "Share" })).toBeDisabled();
		expect(within(dialog).getByLabelText("Note text")).toHaveAttribute("maxLength", "60");
		expect(within(dialog).getByText("Shared for 24 hours.")).toBeInTheDocument();
		await userEvent.type(within(dialog).getByLabelText("Note text"), "Good morning");
		expect(within(dialog).getByText("12/60")).toBeInTheDocument();
		await userEvent.click(within(dialog).getByRole("button", { name: "Friends" }));
		await userEvent.click(within(dialog).getByRole("radio", { name: "Close friends" }));
		await userEvent.click(within(dialog).getByRole("button", { name: "Share" }));

		expect(post).toHaveBeenCalledWith("Good morning", null, "close_friends");
		await waitFor(() =>
			expect(
				within(screen.getByRole("button", { name: "Your note" })).getByText("Good morning"),
			).toBeInTheDocument(),
		);
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
		await userEvent.click(within(dialog).getByRole("button", { name: "Share" }));

		await waitFor(() => expect(post).toHaveBeenCalledWith("", "42", "friends"));
	});

	it("says so when music is unavailable, and the note can still be posted without one", async () => {
		vi.spyOn(api, "searchNoteMusic").mockRejectedValue(new Error("Music is not available right now."));
		await renderBar();
		await userEvent.click(screen.getByRole("button", { name: "New note" }));
		await userEvent.click(await screen.findByRole("button", { name: "Add a song" }));

		const picker = await screen.findByRole("dialog", { name: "Add a song" });
		expect(await within(picker).findByRole("alert")).toHaveTextContent("Music is not available right now.");
	});

	it("edits the two private lists from the people you chat with, each tap saved at once", async () => {
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
		await waitFor(() => expect(friends).toHaveBeenCalledWith(["an", "binh"]));
		await userEvent.click(screen.getByRole("radio", { name: "Hide notes from" }));
		await userEvent.click(screen.getByRole("switch", { name: "An in hidden" }));
		await waitFor(() => expect(hidden).toHaveBeenCalledWith(["an"]));
		expect(screen.getByText("1 person never sees your notes.")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
	});
});

describe("a reply's note quote", () => {
	it("shows the note while it lives, and only that it expired afterwards", () => {
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
});
