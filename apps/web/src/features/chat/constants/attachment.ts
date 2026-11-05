import { cn } from "@/utils/cn";

/**
 * Widest an image is *drawn* at, on a screen with room for it.
 *
 * A ceiling, not a width. The picture also carries `max-w-full`, so on a narrow
 * screen it scales down inside the message row instead of being cut off by it —
 * which is what used to happen: the row is `76vw` on a phone, so on a 390px
 * screen every 320px photograph ran 24px past it and lost its right edge and
 * both corners to `overflow-hidden`.
 *
 * 380 rather than the 320 it was: the row itself allows `min(62vw, 34rem)`, so
 * 320 was spending barely half of what a picture is allowed, and a photograph
 * drawn at thumbnail size in a conversation about it reads as a link to the
 * picture rather than the picture. Still comfortably under the cap, which is
 * what keeps an image part of the exchange rather than the whole view.
 */
export const MAX_ATTACHMENT_DISPLAY_WIDTH = 380;

/**
 * Tallest, for the portrait photos that would otherwise take the entire column
 * and push the message that came with them off screen.
 */
export const MAX_ATTACHMENT_DISPLAY_HEIGHT = 460;

/** What the file picker offers. The server re-encodes whatever arrives anyway. */
export const ACCEPTED_IMAGE_TYPES = "image/*";

/**
 * How many images one message may carry. Mirrors
 * `MAX_ATTACHMENTS_PER_MESSAGE` on the server, which is the one that actually
 * enforces it — this exists so the composer can refuse before the upload rather
 * than after ten megabytes have crossed the wire.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 1;

/**
 * The server stores this longest edge, so sending pixels beyond it only makes
 * the uplink and server decoder work harder. Kept beside the picker limits
 * because this is a wire budget, not display geometry.
 */
export const MAX_IMAGE_UPLOAD_DIMENSION: number = 1600;

/**
 * A high-quality first pass before the server's authoritative re-encode.
 * This is a quality target, not "remove 75%": already efficient images are
 * retained when the browser's result is not actually smaller.
 */
export const IMAGE_UPLOAD_QUALITY: number = 0.86;
export const OPTIMIZED_IMAGE_MEDIA_TYPE: string = "image/webp";
export const REFUSED_FILE_EXTENSIONS = [
	"exe",
	"msi",
	"bat",
	"cmd",
	"com",
	"scr",
	"pif",
	"jar",
	"apk",
	"dmg",
	"app",
	"sh",
	"ps1",
	"vbs",
	"js",
	"jse",
	"wsf",
	"lnk",
	"reg",
] as const;

/**
 * The side of the album's top photograph, in pixels.
 *
 * A compact stack leaves the thread readable while retaining a recognizable
 * cover image. Opening it reveals every image and its full accompanying text.
 */
export const ALBUM_SIZE = 168;

/** A restrained fan signals a set without turning the message into a collage. */
export const ALBUM_CARD_ROTATION = 5;

/** How far each card behind is nudged, in pixels, so the fan leans one way. */
export const ALBUM_CARD_SHIFT = 4;

/** Room for the tilted cards above and beside the cover image. */
export const ALBUM_FAN_REACH = 22;

/** The matching reach below and on the opposite side. */
export const ALBUM_FAN_TRAIL = 6;

/** Two visible cards are enough to imply a set without visual noise. */
export const ALBUM_CARDS_BEHIND = 2;

/**
 * How large a sticker is drawn in the thread.
 *
 * Fixed rather than the picture's own size: a tray holds whatever people put in
 * it, and letting each one size itself would make every sticker a different
 * height in the conversation. `object-contain` inside the square keeps the
 * proportions of the picture itself.
 */
export const STICKER_DISPLAY_SIZE = 128;

/**
 * How long the composer waits for the browser to decode a picked image before
 * giving up on knowing its size.
 *
 * A local decode is a few milliseconds; this is not a budget, it is a guard
 * against never finishing. A corrupt file fires neither `load` nor `error` on
 * some browsers, and jsdom fires neither on any file at all — without a
 * deadline the first optimistic image send would hang instead of appearing.
 * Missing the deadline is not a failure: the bubble goes up without dimensions,
 * exactly as it does for a stored image the server could not measure.
 */
export const IMAGE_MEASURE_TIMEOUT_MS = 1_500;

/**
 * The time, laid over a picture.
 *
 * A photograph is the one message that cannot state its time in the gutter. The
 * gutter is centred on the bubble, so beside a 460px picture the number floats
 * at its middle, level with nothing, belonging to nothing — which is what made
 * an image message read as undesigned however carefully the picture itself was
 * drawn.
 *
 * The album count and timestamp share this legible-on-any-photo treatment:
 * `scrim` keeps either one readable over a white sky and a black jacket, while
 * `meta` keeps a minute ticking over from shifting its width.
 */
export const MEDIA_TIME_CHIP_CLASS =
	"meta pointer-events-none absolute bottom-2 right-2 rounded-badge bg-scrim/70 px-1.5 py-0.5 text-on-media";

/**
 * Every control in the image viewer: close, forward, save, and the two arrows.
 *
 * One class because they are one control repeated — a target drawn on somebody
 * else's photograph. Each of them used to carry its own hairline border, which
 * put four outlined boxes and a panel frame around a single picture; the frames
 * were the loudest thing on screen and the picture was the quietest.
 *
 * What replaces the border is the behaviour: nothing at rest but the glyph, a
 * soft wash under the pointer, and a press that gives slightly. The focus ring
 * is restated because the Button default is drawn in `ink` — which is near-black
 * in the light theme, i.e. invisible against the scrim this sits on.
 */
export const LIGHTBOX_CONTROL_CLASS = cn(
	"rounded-full p-0 text-on-media/70 transition duration-200 ease-out",
	"hover:bg-on-media/12 hover:text-on-media active:scale-95",
	"focus-visible:ring-on-media/40",
);

/**
 * The side of one thumbnail in the viewer's strip, in pixels — as a class pair
 * rather than a number, because nothing computes with it.
 *
 * Larger on a screen with room for it: at 48px a face in a set of holiday
 * photographs is not identifiable, which is the one job a strip of thumbnails
 * has.
 */
export const LIGHTBOX_THUMBNAIL_CLASS = "size-12 sm:size-14";

/**
 * The floating pill that holds rotate and zoom — a second, smaller control
 * language from `LIGHTBOX_CONTROL_CLASS`.
 *
 * Deliberately not the same size: those sit alone at the screen's edges and
 * read as landmarks, so they're drawn big. These four sit shoulder to shoulder
 * in one pill over the picture, and at the same 36px they would have out-massed
 * the header they're grouped away from. 28px keeps the pill a detail you find
 * when you look for it rather than a second toolbar competing with the first.
 */
export const LIGHTBOX_TOOLBAR_BUTTON_CLASS = cn(
	"size-11 shrink-0 rounded-full p-0 text-on-media/75 transition duration-150 ease-out sm:size-7",
	"hover:bg-on-media/15 hover:text-on-media active:scale-90",
	"disabled:pointer-events-none disabled:opacity-30",
	"focus-visible:ring-on-media/40",
);

/** Zoom bounds for the viewer, as multiples of the image's fitted size. */
export const LIGHTBOX_ZOOM_MIN = 1;
export const LIGHTBOX_ZOOM_MAX = 4;

/** What one press of a zoom button, or one press of `+`/`-`, moves the needle. */
export const LIGHTBOX_ZOOM_STEP = 0.5;

/**
 * What one tick of a wheel or trackpad pinch moves it — a third of the button
 * step, because a wheel fires many times a second and the button fires once
 * per press. At the button's own step a single scroll tick would jump the
 * image by half again its size.
 */
export const LIGHTBOX_WHEEL_ZOOM_STEP = 0.15;

/** Where a double-click or double-tap lands — enough to read the detail it was asked to show. */
export const LIGHTBOX_DOUBLE_CLICK_ZOOM = 2.5;
