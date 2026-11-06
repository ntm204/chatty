import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Outbound email: the contract, and the two transports behind it.
 *
 * The interface has always been the point — `auth.service.ts` knows nothing
 * about how a message leaves the building, and `outbox.ts` owns whether it
 * eventually does. What changed in phase 10 is that one of the implementations
 * now actually sends.
 *
 * SMTP rather than a provider's HTTP API, and that is a deliberate narrowing:
 * every provider worth using speaks it (Resend, Postmark, SendGrid, SES, a
 * company relay), so the choice of provider becomes a connection string rather
 * than a dependency and a client to maintain. The cost is no provider-specific
 * features — templates, webhooks, per-message analytics — none of which this
 * app has any use for.
 *
 * The console transport stays, and is not a mock: it is what development uses,
 * printing the link so the flow can be walked without an inbox. What it no
 * longer is, is reachable by accident — see `MAIL_TRANSPORT` in config/env.ts.
 */

export interface Mail {
	to: string;
	subject: string;
	/** Plain text. HTML mail is a provider concern, not this interface's. */
	body: string;
	/**
	 * A stable identifier for this message, used as the SMTP `Message-ID`.
	 *
	 * The outbox row's id, passed through. Delivery is at-least-once — a crash
	 * after the server accepted but before the row is marked sent retries — and
	 * this is the only thing that makes the duplicate *recognisable*: a resend
	 * arrives with the `Message-ID` the first attempt had, which is the header
	 * receiving servers and clients already use to collapse duplicates.
	 *
	 * Not a guarantee. Deduplication is the receiver's choice, and some do not.
	 * It is, however, the SMTP-native answer, and it costs one header.
	 */
	id?: string | undefined;
}

export interface Mailer {
	send(mail: Mail): Promise<void>;
}

/**
 * Writes the message to the log instead of sending it.
 *
 * Logged at `warn`, not `info`, so it stands out in a busy dev log — the whole
 * reason it exists is to be found and clicked.
 */
class ConsoleMailer implements Mailer {
	async send(mail: Mail): Promise<void> {
		logger.warn({ to: mail.to, subject: mail.subject }, `email not sent — no provider configured:\n${mail.body}`);
	}
}

/**
 * Hands a message to an SMTP server.
 *
 * The connection is built once and reused. Nodemailer pools and reconnects
 * underneath, and the alternative — a transport per message — spends a TLS
 * handshake on every password reset.
 *
 * `Message-ID` is set from the outbox row rather than left to nodemailer's
 * random default, so a retried message is recognisably the same message. The
 * domain half is taken from the sender's, because a `Message-ID` whose domain
 * belongs to nobody is a small but real spam signal.
 */
class SmtpMailer implements Mailer {
	private readonly transporter: Transporter;

	constructor(
		private readonly url: string,
		private readonly from: string,
	) {
		// Nodemailer's defaults (two minutes to connect, ten of socket silence) let
		// one send outlive the outbox's two-minute claim lease, after which another
		// worker re-claims the row and the mail goes out twice. These bound each
		// wait on its own; a reset mail is about eight SMTP replies, so a server
		// stalling at every step still finishes or fails inside the lease. Query
		// parameters on SMTP_URL override them.
		this.transporter = nodemailer.createTransport({
			url: this.url,
			dnsTimeout: 5_000,
			connectionTimeout: 10_000,
			greetingTimeout: 10_000,
			socketTimeout: 10_000,
		});
	}

	async send(mail: Mail): Promise<void> {
		await this.transporter.sendMail({
			from: this.from,
			to: mail.to,
			subject: mail.subject,
			text: mail.body,
			...(mail.id ? { messageId: `<${mail.id}@${this.from.split("@")[1]}>` } : {}),
		});
	}
}

/**
 * The transport this process will use, chosen once at startup.
 *
 * The choice comes from `MAIL_TRANSPORT`, which has no default and is validated
 * with its settings before this module is imported — so by the time this line
 * runs, "smtp without a server" and "console in production" have already failed
 * the boot. That is what makes reading an env var here safe: the danger was
 * never the variable, it was a misconfiguration that starts anyway and writes
 * reset links to a log file nobody reads.
 */
function createMailer(): Mailer {
	if (env.MAIL_TRANSPORT === "smtp") {
		// Non-null assertions, and they are earned: config/env.ts refuses to parse
		// `smtp` without both of these. Reaching here with either missing is
		// impossible without editing that schema.
		return new SmtpMailer(env.SMTP_URL!, env.MAIL_FROM!);
	}

	return new ConsoleMailer();
}

export const mailer: Mailer = createMailer();

/** The link a reset email carries, pointed at the web app rather than the API. */
export function buildPasswordResetUrl(token: string): string {
	// CORS_ORIGIN is where the web app is served from — the same value that is
	// already the authority on "which origin is this API's front end".
	return `${env.CORS_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
}

/** The link that confirms a new email address. Same origin, same reasoning. */
export function buildEmailChangeUrl(token: string): string {
	return `${env.CORS_ORIGIN}/confirm-email?token=${encodeURIComponent(token)}`;
}
