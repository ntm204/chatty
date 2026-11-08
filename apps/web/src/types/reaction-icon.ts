/** One element of a doodle reaction drawing, on a 32×32 canvas. */
interface ShapeStyle {
	fill: string;
	stroke?: string;
	strokeWidth?: number;
	opacity?: number;
}

export type ReactionIconShape =
	| (ShapeStyle & { kind: "circle"; cx: number; cy: number; r: number })
	| (ShapeStyle & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number })
	| (ShapeStyle & { kind: "path"; d: string });
