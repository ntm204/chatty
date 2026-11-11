import { expect, it } from "vitest";
import { ApiError, NetworkUnavailableError } from "@/api/core";
import { UserFacingError } from "@/lib/user-facing-error";
import { getErrorMessage } from "@/utils/get-error-message";

const FALLBACK = "That could not be saved. Try again.";

it("shows words written for people and hides everything else", () => {
	expect(getErrorMessage(new ApiError("That handle is taken.", 409, true), FALLBACK)).toBe("That handle is taken.");
	expect(getErrorMessage(new NetworkUnavailableError(), FALLBACK)).toMatch(/offline/);
	expect(getErrorMessage(new UserFacingError("Connect to download."), FALLBACK)).toBe("Connect to download.");

	expect(getErrorMessage(new ApiError("Request to /x failed with 502", 502, false), FALLBACK)).toBe(FALLBACK);
	expect(getErrorMessage(new ApiError("prisma P2002 unique constraint", 500, false), FALLBACK)).toBe(FALLBACK);
	expect(getErrorMessage(new TypeError("Cannot read properties of undefined"), FALLBACK)).toBe(FALLBACK);
	expect(getErrorMessage("boom", FALLBACK)).toBe(FALLBACK);
});
