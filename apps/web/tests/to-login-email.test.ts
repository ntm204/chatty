import { describe, expect, it } from "vitest";
import { toLoginEmail } from "@/features/auth/utils/to-login-email";

describe("toLoginEmail", () => {
	it("completes a seeded account's short name in development", () => {
		expect(toLoginEmail(" 1 ", true)).toBe("1@test.com");
	});

	it("leaves a full email alone", () => {
		expect(toLoginEmail("someone@example.com", true)).toBe("someone@example.com");
	});

	it("never completes anything in a production build", () => {
		expect(toLoginEmail("1", false)).toBe("1");
	});
});
