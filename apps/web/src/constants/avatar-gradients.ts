/**
 * The colour pairs a picture-less avatar is painted in, after Telegram's seven:
 * each person gets one by id, so the same person is the same colour on every
 * screen and in every conversation. Gradients rather than flat fills, top-left
 * light to bottom-right deep — the flat initials discs this replaced read as
 * placeholders; these read as somebody.
 *
 * Fixed in both themes: white initials stay readable on every pair.
 */
export const AVATAR_GRADIENTS: [string, string][] = [
	["#ff885e", "#ff516a"],
	["#ffcd6a", "#ffa85c"],
	["#82b1ff", "#665fff"],
	["#a0de7e", "#54cb68"],
	["#53edd6", "#28c9b7"],
	["#72d5fd", "#2a9ef1"],
	["#e0a2f3", "#d669ed"],
];
