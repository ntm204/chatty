/** An error whose message was written for people, so `getErrorMessage` may show it as-is. */
export class UserFacingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserFacingError";
	}
}
