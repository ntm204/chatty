import { BURST_CONFETTI_COLOURS } from "../constants/emoji-burst";

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	spin: number;
	turn: number;
	life: number;
	maxLife: number;
	size: number;
	colour: string;
}

/**
 * Plays a full-screen burst from a point: confetti for 🎉, the emoji itself
 * rising for ❤️ and 👍. One canvas, added for the burst and removed after it,
 * so nothing runs between bursts; nothing at all under reduced motion.
 */
export function playEmojiBurst(emoji: string, origin: DOMRect): void {
	if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) return;
	const ratio = window.devicePixelRatio || 1;
	canvas.className = "emoji-burst";
	canvas.width = window.innerWidth * ratio;
	canvas.height = window.innerHeight * ratio;
	document.body.append(canvas);

	const isConfetti = emoji === "🎉";
	const originX = (origin.left + origin.width / 2) * ratio;
	const originY = (origin.top + origin.height / 2) * ratio;
	const particles: Particle[] = Array.from({ length: isConfetti ? 110 : 30 }, (_, index) => {
		const angle = isConfetti ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
		const speed = (isConfetti ? 6 + Math.random() * 10 : 3 + Math.random() * 6) * ratio;

		return {
			x: originX,
			y: originY,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - (isConfetti ? 4 : 2) * ratio,
			spin: Math.random() * 6,
			turn: (Math.random() - 0.5) * 0.3,
			life: 0,
			maxLife: 80 + Math.random() * 50,
			size: (isConfetti ? 5 + Math.random() * 6 : 18 + Math.random() * 16) * ratio,
			colour: BURST_CONFETTI_COLOURS[index % BURST_CONFETTI_COLOURS.length]!,
		};
	});

	function step() {
		context!.clearRect(0, 0, canvas.width, canvas.height);
		let alive = 0;
		for (const particle of particles) {
			if (particle.life >= particle.maxLife) continue;
			alive += 1;
			particle.life += 1;
			if (isConfetti) {
				particle.vy += 0.25 * ratio;
				particle.vx *= 0.985;
			} else {
				particle.vx *= 0.97;
				particle.vy = particle.vy * 0.97 - 0.06 * ratio;
				particle.x += Math.sin(particle.life / 9) * ratio;
			}
			particle.x += particle.vx;
			particle.y += particle.vy;
			particle.spin += particle.turn;
			context!.save();
			context!.globalAlpha = Math.min(1, (particle.maxLife - particle.life) / 25);
			context!.translate(particle.x, particle.y);
			context!.rotate(particle.spin);
			if (isConfetti) {
				context!.fillStyle = particle.colour;
				context!.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
			} else {
				context!.font = `${particle.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
				context!.textAlign = "center";
				context!.textBaseline = "middle";
				context!.fillText(emoji, 0, 0);
			}
			context!.restore();
		}
		if (alive > 0) requestAnimationFrame(step);
		else canvas.remove();
	}
	requestAnimationFrame(step);
}
