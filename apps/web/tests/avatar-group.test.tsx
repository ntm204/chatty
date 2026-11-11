import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AvatarGroup } from "@/components/avatar";
import { GroupAvatar } from "@/features/chat/components/group-avatar";
import { makeUser } from "./factories";

afterEach(cleanup);

const people = ["Ann", "Bao", "Chi", "Dung", "Em"].map((name, index) => ({
	user: makeUser(`u${index}`, name),
	name,
}));

it("shows up to three faces, then two and a count, naming everyone", () => {
	const { container, rerender } = render(<AvatarGroup people={people.slice(0, 3)} />);
	expect(container.querySelectorAll(".avatar-group-item")).toHaveLength(3);
	expect(screen.queryByText(/^\+/)).toBeNull();

	rerender(<AvatarGroup people={people} />);
	expect(container.querySelectorAll(".chatty-avatar")).toHaveLength(2);
	expect(screen.getByText("+3")).toBeInTheDocument();
	expect(screen.getByRole("img", { name: "Ann, Bao, Chi, Dung, Em" })).toHaveAttribute(
		"title",
		"Ann, Bao, Chi, Dung, Em",
	);
});

it("draws a group from two members' faces once someone has a photo", () => {
	const withPhoto = { ...makeUser("p", "Photo"), avatarUrl: "/photo.jpg" };
	const plain = makeUser("q", "Plain");
	const { container, rerender } = render(<GroupAvatar size="md" members={[plain, makeUser("r", "Other")]} />);
	expect(container.querySelector("img")).toBeNull();
	expect(container.querySelector(".group-avatar-back")).toBeNull();

	rerender(<GroupAvatar size="md" members={[withPhoto, plain]} />);
	expect(container.querySelector("img")).toHaveAttribute("src", "/photo.jpg");
	expect(container.querySelector(".group-avatar-back")).not.toBeNull();
});
