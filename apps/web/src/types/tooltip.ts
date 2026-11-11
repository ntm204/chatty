/** A tooltip on screen: its text and where its top-centre point sits. */
export interface TooltipState {
	text: string;
	left: number;
	top: number;
	/** Above the control when there is no room below it. */
	isAbove: boolean;
}
