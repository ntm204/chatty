import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageText } from "@/features/chat/thread/components/message-text";
import { makeParticipant } from "./factories";

describe("MessageText", () => {
	it("opens detected links safely without swallowing sentence punctuation", () => {
		render(<MessageText content="Read https://example.com/report, then reply." />);

		const link = screen.getByRole("link", { name: "https://example.com/report" });
		expect(link).toHaveAttribute("href", "https://example.com/report");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
		expect(link.parentElement).toHaveTextContent("Read https://example.com/report, then reply.");
	});

	it("renders the current handle when a mentioned participant was renamed", () => {
		render(
			<MessageText
				content="Hi @old_name"
				mentionedUserIds={["an"]}
				participants={[makeParticipant("an", "An")]}
			/>,
		);

		expect(screen.getByText("@an")).toBeInTheDocument();
		expect(screen.queryByText("@old_name")).not.toBeInTheDocument();
	});
});
