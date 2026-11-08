/** Which device the chat theme picker draws its live preview on. */
export type PreviewDevice = "phone" | "desktop";

/** One bubble in the theme picker's sample conversation. */
export interface PreviewMessage {
	id: number;
	text: string;
	isMine: boolean;
}
