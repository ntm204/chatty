/**
 * What a profile picture may be, said before somebody picks the wrong file.
 *
 * The megabytes have to match `MAX_AVATAR_BYTES` in
 * `apps/server/src/middlewares/upload-image.ts`, which is the only thing that
 * actually enforces them — a hint that quotes a smaller number than the server
 * accepts is a rule this app made up, and one that quotes a larger number is a
 * promise it breaks after the upload.
 */
export const AVATAR_UPLOAD_HINT = "PNG or JPG · up to 5 MB · square works best";

/** Same limit as the server's `MAX_AVATAR_BYTES`, checked before upload so a too-large file fails at once. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
