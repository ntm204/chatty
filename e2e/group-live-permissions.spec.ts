import { expect, test } from "@playwright/test";
import { makeUser, openConversationNamed, register, startGroupChat } from "./helpers.js";

test("live admin changes retain invite choices and invalidate an open removal decision", async ({ browser }) => {
	const ownerContext = await browser.newContext();
	const memberContext = await browser.newContext();
	const otherContext = await browser.newContext();
	const guestContext = await browser.newContext();
	const owner = await ownerContext.newPage();
	const member = await memberContext.newPage();
	const memberUser = makeUser("LiveAdmin");
	const otherUser = makeUser("LiveTarget");
	const guestUser = makeUser("LiveGuest");
	try {
		await register(member, memberUser);
		await register(await otherContext.newPage(), otherUser);
		await register(await guestContext.newPage(), guestUser);
		await register(owner, makeUser("LiveOwner"));
		await startGroupChat(owner, [memberUser, otherUser], "Live permissions");
		const ids = await owner.evaluate(async (handle) => {
			const headers = {
				Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
				"Content-Type": "application/json",
			};
			const { items } = await (await fetch("http://localhost:4100/conversations", { headers })).json();
			const group = items.find((item: { name: string }) => item.name === "Live permissions");
			const participant = group.participants.find((person: { handle: string }) => person.handle === handle);
			const response = await fetch(`http://localhost:4100/conversations/${group.id}/invite-policy`, {
				method: "PUT",
				headers,
				body: JSON.stringify({ invitePolicy: "managers" }),
			});
			if (!response.ok) throw new Error("Invite policy failed");
			return { conversationId: group.id as string, userId: participant.id as string };
		}, memberUser.handle);
		async function setRole(role: "member" | "admin") {
			await owner.evaluate(
				async ({ conversationId, userId, role }) => {
					const response = await fetch(
						`http://localhost:4100/conversations/${conversationId}/members/${userId}/role`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ role }),
						},
					);
					if (!response.ok) throw new Error("Role change failed");
				},
				{ ...ids, role },
			);
		}
		await setRole("admin");
		await openConversationNamed(member, "Live permissions");
		await member.getByRole("button", { name: "Group members", exact: true }).click();
		await member.getByRole("button", { name: "Members", exact: true }).click();
		await member.getByRole("button", { name: "Add people", exact: true }).click();
		const dialog = member.getByRole("dialog", { name: "Add people", exact: true });
		await dialog.getByLabel("Search for someone to add").fill(guestUser.handle);
		await dialog.getByLabel("Search for someone to add").press("Enter");
		await dialog.getByRole("button", { name: `${guestUser.displayName} @${guestUser.handle}` }).click();
		await setRole("member");
		await expect(dialog.getByRole("button", { name: "Add people", exact: true })).toBeDisabled();
		await expect(dialog.getByRole("button", { name: `Remove ${guestUser.displayName}` })).toBeVisible();
		await expect(dialog.getByRole("alert")).toContainText("permission to add people changed");
		await setRole("admin");
		await expect(dialog.getByRole("button", { name: "Add people", exact: true })).toBeEnabled();
		await dialog.getByRole("button", { name: "Add people", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		const actions = member.getByRole("button", { name: `Actions for ${otherUser.displayName}` });
		await actions.focus();
		await member.keyboard.press("Enter");
		await member.keyboard.press("End");
		await expect(
			member.getByRole("menuitem", { name: `Remove ${otherUser.displayName} from the group` }),
		).toBeFocused();
		await member.keyboard.press("Enter");
		await expect(member.getByRole("dialog", { name: "Remove from the group?" })).toBeVisible();
		await setRole("member");
		await expect(member.getByRole("dialog", { name: "Remove from the group?" })).toHaveCount(0);
		await expect(member.getByRole("alert")).toContainText("permissions changed");
		await expect(
			member
				.getByRole("complementary", { name: "Conversation details" })
				.getByText(otherUser.displayName, { exact: true }),
		).toBeVisible();
	} finally {
		await Promise.all([ownerContext.close(), memberContext.close(), otherContext.close(), guestContext.close()]);
	}
});
