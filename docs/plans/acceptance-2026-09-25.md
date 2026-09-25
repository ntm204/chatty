# Nghiệm thu tổng thể Chatty — 2026-09-25

## Kết luận và phạm vi

Chatty ở mốc **0.2.0-rc.1, nghiệm thu nội bộ/local**, chưa phải bản phát hành public.
Sổ XP: **40 done, 11 partial, 9 planned**; kết quả test không tự nâng tiến độ thành 60/60.
Lượt này đưa XP-60 từ planned sang partial nhờ nghiệm thu local và hợp nhất tài liệu,
không đánh dấu done khi ma trận thiết bị thật và các tiêu chí còn lại chưa hoàn tất.
[Experience polish](experience-polish.md) giữ tiêu chí gốc và trạng thái từng ID.
Checkpoint trước chuỗi sửa là `22a388a`; báo cáo này xét cả phần thay đổi chưa commit sau checkpoint.

Phạm vi kiểm tra: cổng chất lượng toàn repo, API/PostgreSQL, luồng browser xuyên suốt,
bản web build với CSP production, các đường phục hồi và quyền liên quan thay đổi,
đối chiếu tài liệu và dọn file trùng. Không triển khai hosting/domain, không phát hành,
không commit/push. Đây không phải kiểm toán bảo mật độc lập hoặc chứng nhận không còn lỗi.

## Bằng chứng của lần rà cuối

| Cổng | Kết quả |
| --- | --- |
| `npm run verify:full` sau sửa | Đạt: 498 test server / 39 file; 603 test web / 90 file; version, typecheck, lint, format và audit quy ước 0 hit |
| `npm run build` | Đạt cả các workspace; còn cảnh báo chunk web chính 603,89 kB (gzip 178,43 kB), không tăng ngưỡng để giấu cảnh báo |
| Toàn bộ Chromium, `npm run test:e2e` | Bản cuối **92/92 đạt trong 10,6 phút**, retries 0; lượt đầu 91/92 và nhóm menu 8/8 ghi riêng |
| `npm audit --json` (cả dev dependencies) | **0 vulnerabilities** sau cập nhật 4 gói; không chỉ audit runtime |
| Built web + CSP nginx, `npm run test:e2e:built` | **1/1 đạt**, image/voice preview/send, offline reload và reconnect dưới CSP lấy từ nginx |
| WebKit chọn lọc | **23/23 đạt trong 2,8 phút**, retries 0; không phải full suite hoặc Safari/iPhone vật lý |
| Kiểm tra tài liệu và diff | 175 liên kết file nội bộ / 43 tài liệu không có đích bị thiếu; sổ XP không trùng ID và đúng 40/11/9; `git diff --check` sạch |

Logs trước sửa: `/tmp/chatty-final-full.log`, `/tmp/chatty-final-chromium.log`.
Logs bản cuối: `/tmp/chatty-final-verified.log`, `/tmp/chatty-final-chromium-verified.log`,
`/tmp/chatty-final-build.log`. Regression menu riêng: `/tmp/chatty-final-menu-chromium.log`.
Built/CSP: `/tmp/chatty-final-built.log`; WebKit: `/tmp/chatty-final-webkit.log`.
Log/screenshot trong `/tmp` là bằng chứng hỗ trợ trên máy này, không phải artifact lưu trữ vĩnh viễn.
Các lượt lỗi ban đầu và lượt xác nhận sau sửa phải được ghi riêng, không cộng thành một full run xanh.

Môi trường: macOS arm64, Apple M4, Node 24, PostgreSQL 16 trong container nghiệm thu riêng;
API 4100/web 5273 và database E2E tách khỏi dữ liệu phát triển.
Container `chatty-acceptance-20260925` đã dừng sau kiểm tra; không dừng container database phát triển.
Browser dùng chuột/bàn phím và touch/mobile viewport emulation; không dùng điện thoại thật.
Unit jsdom không thay thế media playback hoặc layout của browser thật.

Tái chạy sau khi chuẩn bị database test theo [CONTRIBUTING](../../CONTRIBUTING.md),
không trỏ các lệnh này vào database phát triển/production; các suite browser chạy lần lượt:

```bash
npm run verify:full
npm run build
npm audit
npm run test:e2e
npm run test:e2e:built
npx playwright test --config playwright.webkit.config.ts \
  e2e/{appearance,chat,completion-states,conversation-actions,bookmarked-messages,group-live-permissions,media-recovery,notification-tabs,outbox-tabs,reply-draft-recovery,sticker-tray-recovery,vault-live-pages,search-input-polish}.spec.ts
```

## Ma trận kiểm tra và hợp đồng hiện hành

| Nhóm | Đường kiểm tra / bảo đảm có bằng chứng trong repo | Giới hạn cần giữ |
| --- | --- | --- |
| Tài khoản | Đăng ký/đăng nhập, validation, đổi mật khẩu, profile/avatar, logout; realtime tiếp tục sau thay token; draft/cache theo tài khoản | Autofill/password manager và toàn bộ UX form vẫn ở XP-44 |
| Soạn và nháp | Multiline, Enter/Shift+Enter/composition guards, mention/emoji tại caret, mixed clipboard/drop, tách draft theo thread/tài khoản; reply ngoài trang đã tải có Retry/Remove | IME và bàn phím điện thoại vật lý chưa thử |
| Gửi và lỗi | Text/image outbox IndexedDB, clientId chống trùng, hai tab/đổi thread/reconnect, mất response sau commit; phân biệt chuẩn bị/upload/chờ xác nhận/chờ mạng | File/voice/sticker chỉ phục hồi trong phiên, không hứa tồn tại qua reload |
| Đọc và realtime | Hai người/hai tab, socket reconnect, read marker theo hàng thấy được, lịch sử/phân trang, reply jump và Back theo anchor | Ma trận scroll/layout đầy đủ và đo performance vẫn còn |
| Thao tác tin | Edit/history/thu hồi/hide, reaction, pin, forward; pending/lỗi/retry rõ, giữ chữ khi quá hạn edit; khóa race forwarding phía server | Thu hồi không xóa bản đã được sao chép ra ngoài ứng dụng |
| Tìm kiếm | Conversation/global search, query generation, pagination, archived/unloaded destination, Back giữ query/vị trí, snippet Unicode/HTML literal, people search trùng tên | Tìm người theo hợp đồng case-insensitive; không hứa tìm không dấu cho endpoint này |
| Saved và vault | Bookmark riêng tài khoản, invalidation hai tab, giữ cửa sổ trang/anchor khi refresh, remove lỗi/retry, loại mục hidden/retracted, mất membership xóa dữ liệu đang hiển thị | Toggle đồng nhất thread/viewer/vault chưa hoàn tất XP-29 |
| Media | Mixed images giữ phần hợp lệ; file download an toàn theo ADR 0013; AAC/MP4 theo ADR 0014; voice capture/preview/seek/speed và một player; sticker send/remove riêng | Không có antivirus guarantee; mic vật lý, ảnh khó/rotate/touch cần ma trận riêng |
| Quyền media | Cấp lại URL qua auth + membership + hidden/retracted checks; lỗi quyền không tải lại; generation guard bỏ completion cũ; placeholder offline inert | URL đã ký là bearer proof tới hạn theo ADR 0007, không phải cơ chế thu hồi tức thì mọi bản sao |
| Sidebar và nhóm | Loading/error/retry/empty, tên dài/selected, paging, archive/pin/mute expiry; quyền admin thay đổi khi dialog đang mở, partial invitation retry đúng người | Mute/restrict/block/unread toàn ma trận DM và nhóm vẫn ở XP-18 |
| Notification | Metadata ngoài sidebar, mute/restrict, một popup giữa hai tab, privacy preview và click điều hướng | Notification recorder không chứng minh popup/quyền native của OS; không có Web Push khi app đóng |
| UI và truy cập | Light/dark/System, reduced motion, keyboard menu, dialog topmost, safe Cancel, focus fallback, mobile search/reaction | Chưa nghiệm thu screen reader thật, safe area/keyboard/rotation trên thiết bị thật |
| Offline/build | Shell hoàn chỉnh theo build, từ chối install thiếu asset/HTML đổi, không ép reload tab đang dùng; initial offline reconnect resync | Offline server-only actions và ma trận WebKit/thiết bị chưa đầy đủ |

Mã phía server thay đổi trong chuỗi này đã được đối chiếu: endpoint renewal dùng auth và
lọc quyền hiện hành; bookmark invalidation chỉ phát tới room riêng của tài khoản.
Không có migration/schema mới trong lượt rà cuối. Test migration/transaction nằm trong suite server;
không chạy migration lên database phát triển hay production.

## Phát hiện và sửa trong nghiệm thu

- Các đợt trước đã sửa cache shell bị `Vary: Origin` làm miss, initial offline reconnect bỏ resync,
  draft restore quá muộn, reply lookup làm mất quote, mobile reaction bị ẩn/menu tràn,
  voice bị ẩn khi có nháp và confirmation đóng trong lúc pending.
- Lượt tổng thể đầu phát hiện Escape không đóng menu sau thao tác pin thất bại: Chromium mất focus
  khi nút đang focus bị disabled. Sửa phục hồi focus khi API lỗi và ưu tiên Escape của menu;
  test tái hiện trước sửa thất bại, sau sửa đạt, nhóm Chromium liên quan 8/8 đạt.
- Đã tái hiện cảnh báo `ResizeObserver loop completed with undelivered notifications` khi ghi âm mobile.
  Instrumentation xác định `useAutosizeTextarea` ghi height ngay trong observer (60 → 160 px và
  40 → 60 px). Chuyển sang frame kế tiếp, gộp thay đổi width và hủy frame khi cleanup;
  thêm unit và assertion browser không có pageerror. Full Chromium cuối đạt; không còn cảnh báo
  này trong log, ca ghi âm không có pageerror. Đã xem screenshot recorder mobile 375px, không tràn ngang.
- Một số fixture trước đây sai handle quá dài, đọc API trước khi send được xác nhận hoặc tương tác vào
  form còn inert. Việc sửa fixture không thay điều kiện chấp nhận của sản phẩm.

### Dependency security

`verify:audit` là audit quy ước source, **không phải** quét lỗ hổng dependency.
Lượt `npm audit --omit=dev --json` ban đầu báo **3 gói high**: multer, nodemailer, sharp.
Đã nâng minimum trong manifest và cập nhật lockfile: **multer 2.4.0, nodemailer 9.1.1,
sharp 0.35.4**; giữ cùng major, không chạy `audit fix --force` hay nâng đồng loạt.
Đối chiếu [multer advisory](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm),
[nodemailer advisory](https://github.com/advisories/GHSA-8m3c-c648-2xjj) và
[sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).
Quét cả dependency phát triển phát hiện thêm [js-yaml advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
trong cây ESLint. Đã cập nhật riêng **4.3.1 → 4.3.2**, không nâng lên major 5.
`npm audit --json` cuối trả **0 vulnerabilities trên cả cây runtime và dev**.
Log: `/tmp/chatty-final-dependency-audit-clean.json`.
Cổng đầy đủ và Chromium đã chạy với ba dependency runtime mới; sau cập nhật js-yaml chỉ thuộc
tooling, version/typecheck/lint/format/audit cùng built-web/WebKit đều chạy lại và đạt.
Điều này chỉ phản ánh advisory registry tại thời điểm kiểm tra, không chứng minh phần mềm tuyệt đối an toàn.

### Cách hiểu bằng chứng offline và hiệu năng

Ca outbox hai tab có text và bytes ảnh dùng ngắt transport API rồi phục hồi.
WebKit `setOffline(true)` từng làm đọc File/Blob cục bộ thất bại `NotReadableError`;
vì vậy không diễn giải ca ngắt transport thành bằng chứng offline toàn trình duyệt.
Search offline dùng chế độ offline browser thật; built shell có bài offline reload riêng.

Baseline lượt cuối: Chromium 151.0.7922.34, viewport 1280×760, 200 tin trong DB/50 hàng render,
10 mẫu từ Playwright fill tới hai animation frames: median **45,4 ms**, max **79,9 ms**.
Bao gồm overhead automation, không phải SLO production hoặc phép đo thiết bị yếu.
Kịch bản: `e2e/interaction-baseline.spec.ts`. Chưa đo đủ panel/search/scroll/memory.

## Những phần chưa được nghiệm thu trọn vẹn

| Nhóm việc còn lại | XP |
| --- | --- |
| Composer/IME và tương tác menu/chọn văn bản trên thiết bị | 02, 03, 13 |
| Ổn định đọc/cuộn và ma trận unread/quyền/notification | 17, 18, 20 |
| Đồng nhất bookmark và viewer ảnh khó/touch/rotate | 29, 34 |
| Account/autofill; mobile keyboard/safe area; Back; vùng chạm | 44, 46, 47, 49 |
| Bàn phím xuyên suốt, công nghệ hỗ trợ, typography, bộ trạng thái UI | 51, 52, 53, 55 |
| Offline toàn ma trận, vòng đời shell, performance và nghiệm thu thiết bị | 56, 58, 59, 60 |

Đây là **20 mục có cả công việc phần mềm và kiểm chứng**, không phải “chỉ còn deploy”.
Đặc biệt chưa có bằng chứng iPhone/Android thật, OS IME, screen reader thật, native notification
hoặc production tải thật. Chưa có dữ liệu người dùng/retention để kết luận product–market fit.

## Chuẩn bị triển khai sau này

Giữ nguyên Dockerfiles, cấu hình nginx/CSP, biến môi trường mẫu, health/readiness,
migration, backup/restore scripts và [hướng dẫn deployment](../DEPLOYMENT.md).
Built-web acceptance kiểm tra bundle thật dưới CSP lấy từ nginx, không thay cho chạy toàn topology production.
Không xác nhận lại Docker image release, TLS, mail production, off-host restore hay capacity trong lượt này.
Domain, dịch vụ, secrets và diễn tập recovery trên host thật là điều kiện riêng khi được phép deploy.
Web Push, quản lý phiên/thiết bị, message requests, gọi thoại/video và E2EE không được ngầm tính là đã có.

## Dọn tài liệu và khả năng khôi phục

`docs/plans` giảm **9 → 3 file**: mục lục, báo cáo này và sổ XP.
Đã bỏ đánh giá `product-assessment-2026-09-15.md` cùng năm đề xuất phase 24–28
(attachments, voice, vault, sidebar, small things), vì kết quả đã nằm trong ROADMAP,
ARCHITECTURE và ADR; tiêu chí còn lại nằm trong sổ XP. Không giữ các schema/UX đề xuất cũ làm đặc tả mới.
Báo cáo này thay các nhật ký nghiệm thu nối tiếp; không tạo thêm một file tổng hợp nữa.

Bản trước khi gộp/xóa, gồm cả nội dung chưa commit, được sao lưu tại
`/tmp/chatty-docs-backup.KEFC4K`. Bản đã commit vẫn có trong Git; backup `/tmp` chỉ là tạm thời.
Giữ test, ADR, quy ước, tài liệu thiết kế có lý do riêng và hướng dẫn vận hành.
Bỏ qua artifacts/dependencies được gitignore (build, coverage, test-results, node_modules, .data);
không xóa dữ liệu người dùng hoặc thư mục rộng. Sửa các liên kết tới tài liệu đã hợp nhất.
