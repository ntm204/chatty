# Nghiệm thu tổng thể Chatty — 2026-09-25

## Kết luận và phạm vi

Chatty ở mốc **0.2.0-rc.1, nghiệm thu nội bộ/local**, chưa phải bản phát hành public.
Sổ XP: **41 done, 10 partial, 9 planned**; XP-59 chỉ chuyển done sau khi đo, sửa trim
và chạy lại cùng workload, không phải chỉ vì test xanh.
Lượt này đưa XP-60 từ planned sang partial nhờ nghiệm thu local và hợp nhất tài liệu,
không đánh dấu done khi ma trận thiết bị thật và các tiêu chí còn lại chưa hoàn tất.
[Experience polish](experience-polish.md) giữ tiêu chí gốc và trạng thái từng ID.
Checkpoint trước chuỗi sửa là `22a388a`; phần nghiệm thu ban đầu đã được lưu trong
`4ca3034`, `ee95090`, `82b0e05`. Đợt tiếp nối bên dưới được người dùng yêu cầu commit/push riêng.

Phạm vi kiểm tra: cổng chất lượng toàn repo, API/PostgreSQL, luồng browser xuyên suốt,
bản web build với CSP production, các đường phục hồi và quyền liên quan thay đổi,
đối chiếu tài liệu và dọn file trùng. Không triển khai hosting/domain, không phát hành,
Đợt nghiệm thu ban đầu không commit/push; đợt tiếp nối có yêu cầu đẩy code.
Đây không phải kiểm toán bảo mật độc lập hoặc chứng nhận không còn lỗi.

## Cập nhật 2026-10-26: WebKit toàn bộ, offline, Safari

Sổ XP sau đợt này: **49 done / 9 partial / 2 planned** (XP-46, XP-49 cần điện thoại).
Các thay đổi nằm ở ROADMAP phase 54–59; mục này chỉ ghi bằng chứng hiện tại.

| Cổng | Kết quả | Ghi chú |
| --- | --- | --- |
| `npm run verify` | Đạt | web 438 test liên quan, audit 0 hit |
| Full Chromium e2e | **100/100** (6,5 phút) | Máy thức, không retry |
| Full WebKit e2e | **Chưa có lượt trọn vẹn** | Một lượt bỏ vì máy ngủ (3 giờ); một lượt bị dừng ở 94/100 vì hệ thống thiếu RAM, lỗi gồm cả spec chạy riêng thì đạt |
| WebKit từng spec | Đạt sau sửa | affordances, compact-thread, composer-input-boundaries, entry-layout, group, editor-expiry, offline-actions, menu-viewport, reactions, restrictions, blocking, conversation-actions, design-polish |
| Built web trên WebKit | Đạt tới trước bước offline | Playwright WebKit không reload offline được khi có service worker |

Lỗi Safari thật đã sửa: menu thao tác thành viên nhóm đóng trước khi nhận click ("Make admin",
"Remove from group" không có tác dụng); bong bóng gọn thừa 26–60px vì `text-wrap: pretty`.
Còn nợ: một lượt full WebKit khi máy đủ RAM; kiểm tay shell offline trên Safari desktop;
thiết bị thật, VoiceOver và bộ gõ Telex bằng tay.

## Tiếp nối nhỏ: bàn phím menu và Retry tìm kiếm

- XP-51: menu không chiếm phím khi focus ở ngoài hoặc đang composition; Escape trả đúng
  nút mở. Picker emoji lồng đóng trước, trả focus về nút chọn thêm rồi mới đóng reaction menu.
- XP-56: tải trang tiếp khi offline báo cần kết nối nhưng giữ kết quả đã tải. Retry dùng lại
  cursor của trang lỗi ở cả tìm kiếm toàn cục và trong hội thoại, kể cả khi live event ẩn hết
  kết quả cũ. Bấm Retry liên tiếp không tạo hai request phân trang đồng thời.
- Không thêm file tổng hợp. README bổ sung cách mở thư mục, chạy hai terminal và kiểm tra
  database/port; không tạo hosting/domain hoặc đụng vào database phát triển đang chạy.
- Sau đợt performance, sổ XP là **41 done / 10 partial / 9 planned**. Các ca con XP-51/56
  vẫn không được đánh dấu hoàn tất hoặc thay cho kiểm thử thiết bị thật.

Kiểm chứng riêng đợt tiếp nối: `npm run verify` đạt (162 test web liên quan / 12 file;
không có thay đổi server nên changed-suite server không chạy test), typecheck/lint/format
và audit quy ước 0 hit. Hai spec `global-search` và `search-input-polish` đạt **3/3 Chromium**
và **3/3 WebKit**, retries 0. Build web đạt; chunk chính 604,49 kB / gzip 178,78 kB,
cảnh báo kích thước vẫn còn thuộc XP-59. Không gọi đây là lượt chạy lại full suite.
Logs: `/tmp/chatty-easy-verify.log`, `/tmp/chatty-easy-chromium.log`,
`/tmp/chatty-easy-webkit.log`, `/tmp/chatty-easy-build.log`.

## Bằng chứng của lần rà cuối

### Đo hiệu năng thực tế — workload local 2026-09-25

**Kết luận: workload XP-59 đã được đo, điểm giữ lịch sử đã sửa và đo lại đạt.** Đây vẫn
không phải chứng nhận capacity production hay hiệu năng mọi thiết bị.
Bản build web + API biên dịch, Chromium 151.0.7922.34, Node 24.15.0, Apple M4 10 cores / 16 GiB,
macOS arm64. Database thực tế là **PostgreSQL 16.15 Postgres.app qua localhost**, không phải
container Docker đang cùng mở cổng 5432 (đã xác minh version/current_database bằng kết nối Prisma).
Chỉ dùng `chatty_e2e`, không đụng dữ liệu demo/dev. Dataset ban đầu 1.000 tin + 30 nhóm hai người;
các lượt gửi bổ sung làm dataset tăng trong quá trình đo. Hai browser client, rate limiter tắt
theo NODE_ENV=test; service worker tắt để đo cold HTTP cache. Không đại diện production capacity.

| Tương tác | Median máy thường | Median CPU chậm 4× | p95 CPU 4× |
| --- | --- | --- | --- |
| Nhập → hai animation frames | 46,54 ms | 122,84 ms | 163,14 ms |
| Mở panel thông tin | 83,22 ms | 219,64 ms | 235,53 ms |
| Tìm kiếm có debounce | 361,33 ms | 481,69 ms | 518,15 ms |
| Enter gửi → người nhận thấy | 138,46 ms | 242,31 ms | 263,81 ms |

Mỗi ô dựa trên 10 lần; có overhead automation, p95 với 10 mẫu là max, không phải INP/SLO.
Cold HTTP-cache chat shell: 5 lần, median 128,69 ms / max 149,69 ms. CPU 4× + mạng
200 kB/s down, 100 kB/s up, latency 150 ms: 3 lần, median 2.602,66 ms / max 2.613,35 ms.
Mốc shell là ô Find someone hiện, không phải mọi ảnh/font/lịch sử hoàn tất. Cache server/DB
đã ấm; đây không phải cold server. CPU throttle không thay được thiết bị yếu thật.

**API — p95, 100 request mỗi endpoint/mức đồng thời; tổng 1.200 request, toàn bộ 2xx:**

| Endpoint | 1 đồng thời | 5 đồng thời | 20 đồng thời |
| --- | --- | --- | --- |
| Danh sách hội thoại | 7,33 ms | 33,44 ms | 212,76 ms |
| Lịch sử tin nhắn | 7,21 ms | 12,41 ms | 58,37 ms |
| Tìm kiếm | 6,64 ms | 8,99 ms | 28,74 ms |
| Gửi chữ vào cùng hội thoại | 24,79 ms | 155,60 ms | 306,14 ms |

Độ trễ gồm đọc hết response body qua localhost. Gửi vào một thread là workload tranh chấp
cùng hội thoại; transaction tuần tự là ràng buộc đúng dữ liệu, không được bỏ chỉ để tăng RPS.
Endpoint chạy lần lượt, không phải mixed-load nhiều nghìn tài khoản hay soak test nhiều giờ.

**Cuộn sâu và bộ nhớ sau forced GC:**

- Tải thêm 10 trang: median 270,78 ms / p95 365,75 ms. 551 hàng render, heap 9,48 → 26,03 MiB,
  DOM nodes 11.191 → 61.833, listeners 557 → 2.426.
- Bấm về cuối nay trim ngay về **200 hàng**, heap 14,99 MiB, DOM nodes 22.873 và listeners 1.022.
  Lượt trước tái hiện 551 hàng / 25,99 MiB vì ref scroll đổi nhưng effect không chạy lại.
  Sửa dùng trạng thái “xa cuối/đang nhảy” để trim đúng lúc sau khi navigation ổn định;
  cùng assertion ≤200 và workload build đã đạt. Chưa cần thêm thư viện virtualization.
- 60 vòng chọn/bỏ ảnh 1280×720: 14,98 → 15,07 MiB; DOM/listeners không tăng, object URL còn 0.
- 30 vòng mở/đóng viewer: 14,84 → 14,90 MiB, DOM/listeners không tăng.
- 10 vòng ghi âm fake-device 600 ms rồi bỏ: 14,90 → 15,12 MiB; listeners 1.024 → 1.051
  sau 5 vòng rồi giữ nguyên tới 10; object URL còn 0. Chưa thấy tăng tuyến tính trong cửa sổ này.
- Số heap là JS sau GC, không gồm native/GPU buffers; ảnh tổng hợp, audio giả lập và thời gian ngắn
  không đủ kết luận tuyệt đối không leak trong phiên dài/media lớn.

Các bước ngoài XP-59: profile production mixed-load/soak dài và xác nhận trên điện thoại thật.
Không thêm cache/tầng trừ khi số đo sau này cho thấy cần.

Tái chạy: `npx playwright test --config playwright.performance.config.ts` (không chạy song song
E2E khác; reset database `chatty_e2e`). Test riêng không làm full-suite thường chậm đi.
Raw JSON được attach vào Playwright; log sau sửa `/tmp/chatty-performance-after-trim.log`, 1/1
hoàn tất trong 1,8 phút. Lượt trước `/tmp/chatty-performance-final.log` tái hiện lỗi trim;
lượt đầu `/tmp/chatty-performance.log` dừng ở assertion trim; lượt kế
`/tmp/chatty-performance-full.log` bị ngắt do bộ đo mở viewer trước xác nhận gửi. Đã sửa harness
đợi người nhận thấy ảnh; không gọi các lượt trước là pass. Không commit/push.

### Chỉnh bố cục theo phản hồi giao diện

Panel thông tin dùng độ rộng desktop cố định 320px, bỏ resize; sidebar trái vẫn cho thay đổi
độ rộng. *(Cập nhật 2026-10-03: panel thông tin có resize trở lại, 280–480px — xem ROADMAP Phase 53.)* Bỏ dòng tìm tin nhắn riêng, đưa nút vào cùng hàng tìm người. Saved/Bookmarks là hai
shortcut nhỏ cạnh nhau với biểu tượng và mô tả khác nhau; không xoá chức năng hoặc dữ liệu.
Hộp tìm tin nhắn nhỏ hơn, giữ chiều cao ổn định, focus nằm ở hàng nhập thay vì khung vuông.
`npm run verify` đạt (15 test liên quan / 2 file, static checks và audit 0 hit).
Chromium: 5/5 luồng attachments/vault, bookmarks, global search, search/input đạt;
chạy bổ sung global search + Saved/dark mode 1/1 đạt. Đã xem ảnh desktop/mobile và dark mode.
Logs riêng: `/tmp/chatty-layout-verify.log`, `/tmp/chatty-layout-browser.log`,
`/tmp/chatty-layout-dark.log`. Đây không phải lượt full suite mới; chưa commit/push đợt giao diện.

### Rút gọn copy và tối ưu có bằng chứng

Đợt này bỏ diễn giải lặp trong menu hội thoại, Bookmarks và tám tiêu đề settings; rút gọn
empty state, sticker, thông báo và phần chặn/hạn chế. Vẫn giữ phạm vi quyền riêng tư,
hậu quả của thao tác phá huỷ và hướng dẫn xử lý lỗi. Không thêm thư viện hoặc tính năng mới.

| Phần đo/kiểm tra | Kết quả và giới hạn |
| --- | --- |
| `npm run verify` | Đạt: 498 test server / 39 file và 612 test web / 91 file; typecheck/lint/format và audit 0 hit |
| Entry JS, cùng lệnh build trước/sau | 604,99 → 289,86 kB; gzip 178,91 → 93,55 kB. Giảm khoảng 52% phần JS khởi động, không phải ứng dụng nhanh hơn 52% |
| Tổng JS sau chia chunk | Khoảng 605,15 kB, gần như giữ nguyên; chat 287,17 kB và settings 23,92 kB được thực thi khi cần. Service worker vẫn tải nền đủ chunk để hỗ trợ offline |
| Sidebar khởi động | Cache và server chạy đồng thời. Unit giữ cache đọc nhanh, cho server vượt cache chậm, chặn cache cũ ghi đè server; không thay endpoint hoặc giảm kiểm tra quyền |
| Sidebar phân trang | Chặn gọi trùng trong cùng lượt, không request khi hết trang; request cũ không nhả khoá của mục archive mới. Không sao chép/đảo toàn bộ mảng để tìm cursor. Unit, 3/3 completion-states và 5/5 browser sidebar/actions đạt |
| Baseline tương tác | Chromium 151.0.7922.34, macOS arm64 / Apple M4, 1280×760, dataset 200 tin / 50 hàng render; 10 lần fill tới 2 animation frames: median 45,5 ms, max 74,1 ms. Có overhead automation, không phải INP/SLO hoặc so sánh trước/sau |
| Luồng lõi Chromium | 13/13: gửi/nhận, ảnh, reply, search, lỗi/retry, reaction, bookmarks và outbox hai tab chống trùng |
| Build + CSP + offline | 1/1: login chưa thực thi chunk chat/settings; ảnh/voice hoạt động; reload offline và mở settings chưa từng mở vẫn giữ nháp |
| Copy Bookmarks | 1/1 Chromium bổ sung, đã xem ảnh empty state dark mode; không còn hai đoạn giải thích lặp |

Nền tảng đã có: paging tin nhắn 50/lần; trim về 200 khi trở lại live edge; memo hoá hàng tin;
gom unread theo hội thoại ở server; client single-flight và unique client ID chống gửi trùng.
Đây là kiểm tra các đường liên quan, **không phải chứng nhận tối ưu toàn bộ source/feature**.
Chưa đo đủ p95 API dưới tải, cuộn sâu nhiều trang, retained heap sau phiên dài và thiết bị yếu.
Các hook/service chat lớn và snapshot cache ghi theo cập nhật vẫn là điểm cần profile trước khi
refactor; không chia thêm tầng hoặc thêm cache chỉ để tăng số file/đánh dấu xong.
XP-59 đã đạt theo workload lặp lại; tổng XP tăng một mục. Đợt hiện tại đã qua gate cuối và sẵn sàng commit/push.

Logs: `/tmp/chatty-perf-before.log`, `/tmp/chatty-perf-after.log`, `/tmp/chatty-lean-verify.log`,
`/tmp/chatty-lean-core.log`, `/tmp/chatty-lean-built.log`, `/tmp/chatty-lean-copy.log`.
Phân trang/sidebar bổ sung: `/tmp/chatty-pagination-browser.log`, `/tmp/chatty-sidebar-browser.log`.

### Các cổng full-suite của đợt trước

| Cổng | Kết quả |
| --- | --- |
| Gate đầy đủ sau sửa | Đạt: 498 test server / 39 file; 612 test web / 91 file; version, typecheck, lint, format và audit quy ước 0 hit |
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
