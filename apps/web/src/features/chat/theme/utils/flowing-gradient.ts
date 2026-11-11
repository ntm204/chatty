import type { WallpaperColours } from "../types/theme";

/**
 * Eight stops on a slightly squashed ring around the centre. The four colours
 * sit on every other stop, so one step moves each colour to its neighbour.
 */
const RING_STOPS: [number, number][] = Array.from({ length: 8 }, (_, index) => {
	const angle = (index / 8) * Math.PI * 2 - Math.PI / 2;

	return [0.5 + Math.cos(angle) * 0.34, 0.5 + Math.sin(angle) * 0.4];
});

/** Wraps any whole step, negative included, onto the eight stops. */
function ringIndex(step: number): number {
	return ((step % 8) + 8) % 8;
}

function parseHex(hex: string): [number, number, number] {
	return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

/** Smooth in and out, so a step leaves and lands without a jolt. */
export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Paints the wallpaper into `image` for a position on the ring.
 *
 * `step` is fractional while moving between stops. Each pixel takes the four
 * colours weighted by closeness, which is what makes them melt into each other
 * rather than sit as blobs. `twist` rotates the sampling point around the
 * centre, more strongly nearer it: at 0 the colours rest, mid-move they swirl
 * like dye being stirred. Written from that description of Telegram's effect,
 * not from its code.
 */
export function paintFlowingGradient(image: ImageData, colours: WallpaperColours, step: number, twist: number): void {
	const rgb = colours.map(parseHex);
	const base = Math.floor(step);
	const fraction = step - base;
	const points = [0, 1, 2, 3].map((index) => {
		const from = RING_STOPS[ringIndex(base + index * 2)]!;
		const to = RING_STOPS[ringIndex(base + index * 2 + 1)]!;

		return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
	});
	const { width, height, data } = image;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const u = x / (width - 1) - 0.5;
			const v = y / (height - 1) - 0.5;
			const angle = twist * Math.max(0, 0.7 - Math.hypot(u, v)) * 2;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const px = u * cos - v * sin + 0.5;
			const py = u * sin + v * cos + 0.5;
			let total = 0;
			let red = 0;
			let green = 0;
			let blue = 0;
			for (let index = 0; index < 4; index += 1) {
				const point = points[index]!;
				const weight = Math.pow(Math.max(0, 0.95 - Math.hypot(px - point[0]!, py - point[1]!)), 3);
				const colour = rgb[index]!;
				total += weight;
				red += colour[0] * weight;
				green += colour[1] * weight;
				blue += colour[2] * weight;
			}
			const offset = (y * width + x) * 4;
			data[offset] = red / total;
			data[offset + 1] = green / total;
			data[offset + 2] = blue / total;
			data[offset + 3] = 255;
		}
	}
}
