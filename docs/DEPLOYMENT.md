# Deployment

The launch constraint is a product decision: **no recurring infrastructure bill while Chatty is
small**. The only planned purchase is a domain. A paid service may replace a free component later,
but only after a measured limit is crossed; it is never a prerequisite chosen for convenience.

**Nothing is deployed yet.** The repository now contains the production topology, but the external
accounts, domain and backup destination cannot be created from source code.

---

## Chosen topology

```text
browser
   |
   | HTTPS / WebSocket
   v
Cloudflare edge + named Tunnel             $0
   | outbound-only connection
   +---- app.<domain> -> web (nginx)
   `---- api.<domain> -> Caddy -> api-1 / api-2
                                  |       |
                                  +-- PostgreSQL
                                  +-- Redis
                                  `-- shared upload volume
                                      one host
```

Everything below the tunnel runs in `docker-compose.prod.yml` on one machine. Caddy is an internal
load balancer; the two API processes share Socket.IO rooms and rate limits through Redis, and share
the upload volume because they are on the same host. `docker-compose.tunnel.yml` adds the public edge
only after a domain and tunnel token exist.

The default host order is:

1. **An existing always-on computer** for a private alpha. This has no vendor bill, though electricity,
   hardware wear and the owner's time are real costs.
2. **Oracle Cloud Always Free** for a public alpha. Oracle currently includes up to two AMD micro VMs
   and an Ampere A1 allowance equivalent to 2 OCPUs and 12 GB RAM for a free tenancy. Signup normally
   requires a phone and card, capacity can be unavailable in the chosen home region, and free limits
   can change.
3. A paid VPS only after both options are unsuitable and real usage justifies recurring spend.

Fly.io and a collection of separate managed Postgres/Redis services are deliberately not the default.
They add a monthly bill or several independent free-tier ceilings while the existing single-host
stack already has the right consistency boundary.

### Why Cloudflare Tunnel

A named tunnel is available on Cloudflare plans and connects outward from the host, so the host needs
no public IP and opens no inbound port. Cloudflare also provides Universal SSL for domains on its DNS.
The domain is required to publish stable application hostnames; a random Quick Tunnel is development
only and has no availability promise.

This topology does not make Cloudflare a media store. The current 10/16/25 MB upload limits are small,
but Cloudflare's current service terms restrict serving video and other large files through proxied
hostnames on Free/Pro/Business plans. Re-check those terms before increasing the limits. Cloudflare R2
is the first object-store candidate if media outgrows the host because its Standard tier currently
includes 10 GB-month storage, 1 million Class A operations, 10 million Class B operations and free
Internet egress each month. It is a ceiling, not a promise that storage will always cost zero.

---

## What is free, and what is blocked

| Part | Initial choice | Cost | State / condition |
| --- | --- | --- | --- |
| Compute | Existing machine, then Oracle Always Free | $0 vendor bill | External account/capacity is needed for Oracle; an existing machine can run now |
| PostgreSQL, Redis, web, gateway | Official container images on the same host | $0 | Implemented in `docker-compose.prod.yml` |
| TLS, DNS, public ingress | Cloudflare DNS + named Tunnel | $0 service cost | **Blocked until a domain is bought**, added to Cloudflare, and a tunnel token is created |
| Transactional mail | Resend Free over the existing SMTP transport | $0 within 3,000 emails/month and 100/day | **Blocked until the domain exists**, is verified, and SPF/DKIM/DMARC plus SMTP credentials are configured |
| Upload storage | Shared local volume | $0 | Ready for one host; object storage is deliberately deferred |
| Logs | Existing structured Pino logs + bounded Docker log rotation | $0 | Implemented in the production Compose files |
| Metrics | Protected Prometheus-compatible app metrics, then Grafana OSS if a dashboard is useful | $0 | Implemented; scrape both API containers separately with the bearer token |
| Backups | Age-encrypted database/upload bundle to a user-owned disk or free object-store allowance | $0 initially | Tooling and local mutation/restore drill complete; choose the off-host destination/retention and repeat the drill there before public launch |

Resend is chosen because it speaks SMTP, so no provider SDK enters the application, and its free plan
currently covers 3,000 transactional emails per month with a 100/day limit. A verified domain is still
required. The provider can be replaced by changing `SMTP_URL` and `MAIL_FROM`, not application code.

“$0” here means no recurring vendor invoice inside the published allowance. It does not mean infinite
capacity, free electricity, free backups, or zero maintenance. Every external free tier gets a usage
alert and a hard budget/limit where the provider supports it; Chatty does not silently cross into paid
overage.

### Encrypted backup and restore

Install the free `age` command and create an offline identity once. Keep the identity somewhere other
than the application host; only its public recipient belongs in the backup job:

```bash
age-keygen -o /secure/chatty-backup-identity.txt
age-keygen -y /secure/chatty-backup-identity.txt
```

Point the command at a mounted external disk or synchronized off-host directory and choose retention:

```bash
export CHATTY_BACKUP_DIR=/mnt/off-host/chatty
export CHATTY_BACKUP_RECIPIENT=age1...
export CHATTY_BACKUP_RETENTION_DAYS=30
npm run backup:prod
```

The command briefly stops application writers so the PostgreSQL dump and upload volume describe the
same point in time, then records SHA-256 hashes and encrypts the bundle before its atomic final rename.
Schedule that command with the host's cron/systemd timer. A restore is deliberately harder to invoke:

```bash
export CHATTY_BACKUP_IDENTITY=/secure/chatty-backup-identity.txt
export CHATTY_RESTORE_CONFIRM=replace-chatty-data
npm run restore:prod -- /mnt/off-host/chatty/chatty-YYYYMMDDTHHMMSSZ.tar.gz.age
```

Restore verifies both hashes before stopping application writers, restores PostgreSQL in a single
transaction, replaces uploads and brings the services back. If mutation starts and a later step fails,
writers remain stopped for inspection instead of serving a half-restored snapshot. First run it on a
disposable deployment; the public launch gate closes only after that drill proves the chosen destination
can actually be read.

The repository-level drill has already proved encryption, checksums, database/upload restoration and
rollback of data written after the snapshot. It also led to a schema-qualified `immutable_unaccent`
wrapper: PostgreSQL restores with an empty search path, so dump portability must not depend on `public`
being implicit. The launch drill repeats this against the actual off-host destination and host.

---

## Launch procedure once the domain exists

1. Put the domain on Cloudflare's Free plan and create `app.<domain>` and `api.<domain>` as public
   hostnames on one named Tunnel:
   - `app.<domain>` -> `http://web:8080`
   - `api.<domain>` -> `http://api-gateway:4000`
2. Verify the domain with Resend and publish its SPF/DKIM records plus a DMARC policy. Obtain the SMTP
   API key.
3. Generate independent random database and JWT secrets. Set:

   ```bash
   export WEB_ORIGIN=https://app.example.com
   export API_PUBLIC_URL=https://api.example.com
   export POSTGRES_PASSWORD=<random-secret>
   export JWT_SECRET=<at-least-32-random-bytes>
   export SMTP_URL=smtps://resend:<api-key>@smtp.resend.com:465
   export MAIL_FROM=no-reply@example.com
   export METRICS_TOKEN=<at-least-32-independent-random-characters>
   export TUNNEL_TOKEN=<cloudflare-tunnel-token>
   ```

4. Start the stack and tunnel together:

   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml up -d --build
   ```

5. Run `scripts/smoke.sh https://api.example.com`, open the web app in a real browser, verify the CSP,
   socket reconnect and image viewer, and send a password reset to an external inbox.
6. Configure Prometheus to scrape `api-1:4000/metrics` and `api-2:4000/metrics` separately with
   `Authorization: Bearer <METRICS_TOKEN>`. Scraping the gateway alternates between two independent
   registries and produces an incomplete series.
7. Configure `backup:prod`, then run `restore:prod` on a disposable deployment. A backup that has not
   been restored is only a file.

The production compose ports bind to `127.0.0.1`, so the on-host smoke test can reach them while the
public network cannot bypass Cloudflare. The tunnel joins the same Compose network and reaches the
services by container name.

### Database requirement

The database must allow `CREATE EXTENSION unaccent`. It ships in the official PostgreSQL image used
here. Without it the phase 20 migration fails at deploy time, which is preferable to silently losing
Vietnamese accent-insensitive search.

---

## When the architecture is allowed to grow

- Move uploads to S3-compatible object storage when API instances stop sharing one host, the local
  volume approaches its capacity budget, or backup/restore time breaches the recovery target.
- Add a durable client event cursor when reconnect repair regularly needs more than the newest page,
  or offline reading/sending becomes a committed feature.
- Split recent delivery from long-term storage only when measured database latency sits on the send
  critical path or independent replay is required.
- Replace a free tier with a paid service only when its alert is reached and the product has enough
  usage or revenue to make the new recurring cost intentional.

See [ADR 0016](adr/0016-bandwidth-first-message-delivery.md) for the message/media thresholds.

---

## Sources

Checked September 2026; re-check limits immediately before launch.

- [Oracle Cloud Free Tier](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm) and
  [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/),
  [Tunnel setup and domain requirement](https://developers.cloudflare.com/tunnel/setup/), and
  [free Universal SSL](https://developers.cloudflare.com/fundamentals/manage-domains/)
- [Cloudflare R2 pricing and free allowance](https://developers.cloudflare.com/r2/pricing/)
- [Resend pricing](https://resend.com/pricing) and
  [SMTP configuration](https://resend.com/docs/send-with-smtp)
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Prometheus overview](https://prometheus.io/docs/introduction/overview/) and
  [Grafana OSS](https://grafana.com/oss/grafana/)
- [age file encryption](https://github.com/FiloSottile/age)

## Changing the Socket.IO adapter

The classic Redis adapter and the sharded adapter use different Pub/Sub mechanisms and protocols.
A mixed pool splits realtime delivery and presence even when every process reports healthy. Redis 7
is required for the sharded adapter. A one-line source revert still requires a coordinated rollout.

For the first classic-to-sharded transition (and for a rollback across this boundary):

1. Build or pull the target images before the maintenance window. Keep the previous images available.
2. Pause user traffic at the ingress and stop **both** API instances. With the provided stack,
   `docker compose -f docker-compose.prod.yml stop api-1 api-2` closes existing sockets. Keep Redis,
   PostgreSQL and the upload volume running; do not remove volumes.
3. Start both API instances from the same target revision, with the deployment environment loaded:
   `docker compose -f docker-compose.prod.yml up -d --no-deps api-1 api-2`.
4. Confirm both instances are ready, then verify message delivery and presence using clients connected
   to different instances before restoring user traffic. Readiness alone cannot prove cross-node delivery.
5. If rolling back, stop both instances again and restore the same previous adapter revision on both
   before reopening traffic. Do not leave classic and sharded instances serving together.

This procedure has a brief interruption. For the host-only smoke test, the built web app is at
`http://localhost:8080`; everyday development uses `http://localhost:5173` instead. See the
[local port table](../README.md#getting-started).
