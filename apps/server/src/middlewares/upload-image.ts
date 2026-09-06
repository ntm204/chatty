import type { NextFunction, Request, Response } from "express";
import multer, { MulterError, type StorageEngine } from "multer";
import { ValidationError } from "../lib/errors.js";

/**
 * Multipart parsing for the two things this app accepts uploads of.
 *
 * One factory rather than a file per endpoint: the wrapping below exists to turn
 * multer's own failures into typed errors, and a second copy of it is a second
 * place for a `LIMIT_FILE_SIZE` to start reaching users as a 500.
 */

/**
 * Big enough for a photo straight off a phone, small enough that a handful of
 * concurrent uploads cannot exhaust memory — these are buffered, not streamed
 * to disk, because the file is re-encoded before anything is written.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Roomier than an avatar: this one is the thing being sent, not a thumbnail of a face. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_VOICE_UPLOAD_BYTES = 16 * 1024 * 1024;

/**
 * How many images one message may carry.
 *
 * Ten, and the number is about the reader rather than the uploader: a gallery
 * past this stops being glanceable and wants a screen of its own. It also caps
 * what one request can buffer — these are held in memory until the re-encode,
 * so the real ceiling is this times `MAX_ATTACHMENT_BYTES`.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_FILES_PER_MESSAGE = 1;

export const REFUSED_FILE_EXTENSIONS = new Set([
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
]);

/**
 * Where a rejected file's reason waits between `fileFilter` and the wrapper
 * that turns it into a response.
 *
 * `fileFilter` must reject through `next(null, false)`, never `next(error)`.
 * Busboy's own stream for that part is only drained by Multer on the
 * `false` path (`fileStream.resume()`); on the error path it is not, and
 * because the callback never sees the field's stream — only Multer's
 * internal `handleFile` closure holds it — there is no way to drain it from
 * here either. A client sending a second, larger field after the rejected
 * one then has its request stall for minutes waiting on backpressure that
 * never clears, which was reproducing as an unrelated-looking timeout in
 * whichever test or request happened to run next. Keying the reason here
 * and re-throwing it once Multer's callback fires keeps the exact same
 * error messages without ever leaving a part stream unconsumed.
 */
const fileRejection = new WeakMap<Request, ValidationError>();

interface ImageUploadOptions {
	/** Form field the file arrives under. The client must match this exactly. */
	field: string;
	maxBytes: number;
	/** Names the thing in the error a user reads — "Avatar", "Image". */
	label: string;
	/**
	 * How many files this field accepts. One means `req.file`; more means
	 * `req.files`, which is a different property, so the two cannot be confused
	 * by a handler reading the wrong one.
	 */
	maxFiles: number;
}

function createImageUpload(options: ImageUploadOptions) {
	const upload = multer({
		// Memory, not disk. Multer's disk storage writes the raw upload under a
		// name it invents, which would mean an unvalidated file sitting in the
		// filesystem between arriving and being checked. Nothing untrusted
		// reaches disk here.
		storage: multer.memoryStorage(),
		limits: { fileSize: options.maxBytes, files: options.maxFiles },
		fileFilter: (req, file, next) => {
			// A first pass only. The client picks this header, so it proves nothing
			// — the real check is the re-encode in lib/*-storage.ts. This just stops
			// ten megabytes of video being buffered before that happens.
			if (!file.mimetype.startsWith("image/")) {
				fileRejection.set(req, new ValidationError(`${options.label} must be an image`));
				next(null, false);

				return;
			}

			next(null, true);
		},
	});

	const parse = options.maxFiles === 1 ? upload.single(options.field) : upload.array(options.field, options.maxFiles);

	/**
	 * Parses the multipart body into `req.file`.
	 *
	 * Wrapped rather than used directly so multer's own failures become the
	 * project's typed errors. Left alone, a `LIMIT_FILE_SIZE` reaches the error
	 * middleware as an unrecognized error and is reported as a 500 — "something
	 * broke" instead of "your picture is too big".
	 */
	return function uploadImage(req: Request, res: Response, next: NextFunction): void {
		parse(req, res, (error: unknown) => {
			if (error instanceof MulterError) {
				const message = describeMulterError(error, options);

				next(new ValidationError(message));

				return;
			}

			if (!error && fileRejection.has(req)) {
				next(fileRejection.get(req));

				return;
			}

			next(error);
		});
	};
}

/**
 * Turns multer's own failure codes into the sentence a person reads.
 *
 * Separate because there are now three of them and the too-many-files case is
 * the one a user meets by accident — picking twelve photos in the file dialog
 * is one drag, and "could not read the upload" would be a lie about why.
 */
function describeMulterError(error: MulterError, options: ImageUploadOptions): string {
	if (error.code === "LIMIT_FILE_SIZE") {
		return `${options.label} must be smaller than ${options.maxBytes / 1024 / 1024}MB`;
	}

	if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
		return options.maxFiles === 1
			? `Send one file in a "${options.field}" field`
			: `A message may carry at most ${options.maxFiles} images`;
	}

	return `Could not read the upload — send files in a "${options.field}" field`;
}

/** One image into the tray. Same ceiling as a message's, same re-encode after. */
export const uploadSticker = createImageUpload({
	field: "sticker",
	maxBytes: MAX_ATTACHMENT_BYTES,
	label: "Sticker",
	maxFiles: 1,
});

export const uploadAvatar = createImageUpload({
	field: "avatar",
	maxBytes: MAX_AVATAR_BYTES,
	label: "Avatar",
	maxFiles: 1,
});

/** Same shape as a user avatar upload — see ADR 0022. */
export const uploadConversationAvatar = createImageUpload({
	field: "avatar",
	maxBytes: MAX_AVATAR_BYTES,
	label: "Photo",
	maxFiles: 1,
});

/**
 * Mounted on `POST /conversations/:id/messages`, which also accepts plain JSON.
 * Multer passes a non-multipart request straight through, leaving `req.files`
 * an empty array — so one route serves a text message and a gallery without a
 * branch in front of it.
 */
export const uploadAttachment = createImageUpload({
	field: "attachment",
	maxBytes: MAX_ATTACHMENT_BYTES,
	label: "Image",
	maxFiles: MAX_ATTACHMENTS_PER_MESSAGE,
});

function getExtension(fileName: string): string {
	const safeName = fileName.trim().replace(/[. ]+$/gu, "");
	const lastDot = safeName.lastIndexOf(".");

	return lastDot < 0 ? "" : safeName.slice(lastDot + 1).toLowerCase();
}

function uploadLimitFor(fieldName: string): number {
	if (fieldName === "attachment") return MAX_ATTACHMENT_BYTES;
	if (fieldName === "voice") return MAX_VOICE_UPLOAD_BYTES;

	return MAX_FILE_BYTES;
}

/**
 * Multer only has one global byte ceiling, but this route carries three shapes
 * with different limits. Capping each stream while it is read avoids buffering
 * a 25MB "image" ten times before the controller can apply the 10MB rule.
 */
const fieldBoundedMemoryStorage: StorageEngine = {
	_handleFile(_req, file, callback) {
		const chunks: Buffer[] = [];
		const limit = uploadLimitFor(file.fieldname);
		let size = 0;
		let finished = false;

		function finish(error?: Error): void {
			if (finished) return;
			finished = true;
			if (error) callback(error);
			else callback(undefined, { buffer: Buffer.concat(chunks), size });
		}

		file.stream.on("data", (chunk: Buffer) => {
			if (finished) return;
			size += chunk.byteLength;
			if (size > limit) {
				chunks.length = 0;
				finish(new MulterError("LIMIT_FILE_SIZE", file.fieldname));

				return;
			}
			chunks.push(chunk);
		});
		file.stream.on("error", (error: Error) => finish(error));
		file.stream.on("end", () => finish());
	},
	_removeFile(_req, _file, callback) {
		callback(null);
	},
};

const selectedUploadShape = new WeakMap<Request, string>();

/**
 * One multipart parser for the message endpoint's three mutually exclusive
 * upload shapes. The controller enforces the exclusivity after parsing because
 * only it can see every field together.
 */
const messageUpload = multer({
	storage: fieldBoundedMemoryStorage,
	limits: { files: MAX_ATTACHMENTS_PER_MESSAGE },
	fileFilter: (req, file, next) => {
		const selectedField = selectedUploadShape.get(req);
		if (selectedField && selectedField !== file.fieldname) {
			fileRejection.set(req, new ValidationError("Send images, one file, or one voice message — not a mixture"));
			next(null, false);

			return;
		}
		selectedUploadShape.set(req, file.fieldname);

		if (file.fieldname === "attachment" && !file.mimetype.startsWith("image/")) {
			fileRejection.set(req, new ValidationError("Image must be an image"));
			next(null, false);

			return;
		}

		if (file.fieldname === "file" && REFUSED_FILE_EXTENSIONS.has(getExtension(file.originalname))) {
			fileRejection.set(req, new ValidationError("Executable files cannot be sent"));
			next(null, false);

			return;
		}

		if (file.fieldname === "voice" && !file.mimetype.startsWith("audio/")) {
			fileRejection.set(req, new ValidationError("Voice message must be audio"));
			next(null, false);

			return;
		}

		next(null, true);
	},
}).fields([
	{ name: "attachment", maxCount: MAX_ATTACHMENTS_PER_MESSAGE },
	{ name: "file", maxCount: MAX_FILES_PER_MESSAGE },
	{ name: "voice", maxCount: 1 },
]);

export function uploadMessageAttachments(req: Request, res: Response, next: NextFunction): void {
	messageUpload(req, res, (error: unknown) => {
		if (error instanceof MulterError) {
			// Busboy reports LIMIT_FILE_COUNT before Multer attaches the final
			// file's field. The first accepted field still identifies the shape.
			const field = error.field ?? selectedUploadShape.get(req);
			if (error.code === "LIMIT_FILE_SIZE") {
				const maxBytes =
					field === "voice"
						? MAX_VOICE_UPLOAD_BYTES
						: field === "attachment"
							? MAX_ATTACHMENT_BYTES
							: MAX_FILE_BYTES;
				next(
					new ValidationError(
						`${field === "voice" ? "Voice message" : field === "attachment" ? "Image" : "File"} must be smaller than ${maxBytes / 1024 / 1024}MB`,
					),
				);

				return;
			}
			if (
				(error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") &&
				field === "attachment"
			) {
				next(new ValidationError(`A message may carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} images`));

				return;
			}

			next(new ValidationError("Could not read the message upload"));

			return;
		}

		if (!error && fileRejection.has(req)) {
			next(fileRejection.get(req));

			return;
		}

		next(error);
	});
}
