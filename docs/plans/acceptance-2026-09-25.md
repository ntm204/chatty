# Nghiệm thu tổng thể Chatty — 2026-09-25

## Kết luận và phạm vi

Chatty phát hành **0.2.1 (2026-11-06), bản local/private**, chưa phải bản phát hành public.
Đoạn dưới mô tả mốc 0.2.0-rc.1 tại thời điểm nghiệm thu.
Sổ XP tại mốc 2026-09-25: **41 done, 10 partial, 9 planned**; XP-59 chỉ chuyển done sau khi đo, sửa trim
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

## Cập nhật 2026-11-05: hoàn thiện phần mềm còn lại và đối chiếu cả 60 XP

Chủ dự án xác nhận **chưa có thiết bị thật để kiểm tra**. Giữ nguyên tiêu chí gốc,
không đổi nhãn thành done để bù cho việc thiếu thiết bị. Sổ hiện có **49 done /
11 partial / 0 planned**: XP-46/49 đã triển khai phần mềm, còn nghiệm thu thiết bị.
`node scripts/check-experience-progress.mjs --json` đọc đủ 60 định nghĩa và sổ trạng thái,
kiểm tra trùng ID và phát hiện số README lệch sổ; không tính phase lịch sử thành tiến độ.

Phần sửa trong lượt này:

- Mobile: shell theo VisualViewport khi keyboard che layout viewport; bỏ qua pinch zoom;
  safe area ngang; sửa selector input cũ để textarea có chữ 16px; giới hạn composer,
  ảnh preview và picker theo chiều cao còn nhìn thấy; mở rộng vùng chạm có phạm vi.
- Viewer: caption dài được xuống dòng; toolbar wrap ở màn hẹp, nút 44px trên mobile;
  album có scroller giới hạn chiều rộng để vẫn tới được ảnh đầu/cuối và nút đóng.
- Keyboard/accessibility: menu đính kèm bỏ qua composition/229 và phím ngoài focus;
  Escape chỉ đóng menu đó; trợ giúp phím tắt có điểm vào ở sidebar, focus trap và
  trả focus; voice kết thúc trả focus từ nút speed sắp ẩn về nút Play.
- Notification: recheck quyền khi mở settings/quay lại ứng dụng; chống yêu cầu quyền
  trùng; lỗi trình duyệt từ chối request có thông báo và có thể thử lại.
- AI: thêm `AGENTS.md` ngắn với nguồn tiến độ, cách đọc có mục tiêu, quy tắc bằng chứng,
  giới hạn agent và test/database. Không thêm skill/dependency chỉ để tăng số lượng.

### Chốt theo yêu cầu chủ dự án — 2026-11-05

Dừng các lượt nghiệm thu dài theo yêu cầu, không commit/push và không đánh dấu đủ 60/60.
Mã đã sửa còn ở working tree; sổ giữ **49 done / 11 partial / 0 planned**.

| Kiểm tra thực tế | Kết quả và giới hạn |
| --- | --- |
| Full web unit | 652/652 đạt trước các chỉnh cuối về touch/identity; sau chỉnh cuối, 19/19 unit tập trung đạt, gồm viewer thật qua draft → ack → history |
| Full server | Một lượt đạt 507/507; lượt gate sau có 506 đạt và một timeout 5 giây ở typing/socket. Trace/log cho thấy fixture tạo 3 tài khoản bcrypt và socket gần hết ngân sách; chưa chốt sửa fixture, không gọi gate cuối là đạt |
| Voice HTTP | 25/25 đạt sau khi chỉ tăng deadline ca FFmpeg từ 5 lên 15 giây; mọi assert codec/duration/waveform/range giữ nguyên |
| Chromium các ca mới | 6/6 viewer, keyboard/voice, mobile viewport và touch targets đạt. Bài baseline riêng sau sửa phần chuẩn bị đạt 1/1 với đủ 200 HTTP writes theo batch 4 |
| Full Chromium | Lượt rộng tìm ra lỗi viewer optimistic/ack và fixture baseline, đã sửa và chạy lại có mục tiêu; chưa có lượt full hoàn chỉnh trên toàn bộ mã cuối |
| WebKit | Các lượt rộng/nhỏ chưa hoàn tất trên mã cuối; kết quả 26/10 phía dưới là lịch sử, không thay cho lượt mới |
| Static checks | Typecheck/lint đạt sau sửa; audit cuối 0 hit. ChatPage tách nhóm overlay thành component để giữ quy ước kích thước file |
| Built/CSP/offline | Chưa chạy lại trên mã cuối trong lượt này; giữ nguyên bằng chứng lịch sử và phần Safari thật còn nợ |

Viewer được portalled khỏi vùng stacking của hàng tin; thao tác touch không focus hàng nền.
Map UI identity giới hạn theo các hàng đang render, giữ viewer/ảnh chọn khi upload đổi ID và
khi history bỏ clientId. Vùng chạm coarse ngoài composer cũng đã có cho menu/reaction,
thanh reaction wrap ở 320px và chip có layout riêng thay vì các hitbox chồng nhau.

Test PostgreSQL tùy chọn đã xác minh filesystem thực là tmpfs 256 MB, fsync/synchronous_commit
vẫn bật. Kết nối override dùng 127.0.0.1 để tránh fallback localhost/IPv6 vượt maxWait.
Database phát triển được giữ nguyên; tablespace thử nghiệm đã dọn; dừng stack test khi chốt.
Chạy lại bằng hướng dẫn README khi có đủ thời gian/tài nguyên. Các lượt fixture lỗi, bị dừng
hoặc full suite chưa hoàn tất không được tính thành pass. Chatty dev được khởi động lại trên 5173/4000.

### Tiếp nối theo yêu cầu xử lý và push — 2026-11-05

Ca typing/socket hết 5 giây ở phần chuẩn bị ba tài khoản, chưa hoàn tất cửa sổ quan sát sự kiện.
Fixture nay tạo user trực tiếp và ký JWT hợp lệ; vẫn kết nối socket thật, kiểm tra xác thực,
membership và giữ nguyên cửa sổ quan sát 700 ms. Không tăng timeout hoặc sửa logic relay.
Chạy lại riêng file đạt **10/10**. Fixture read-receipts cũng tạo user trực tiếp vì không
kiểm tra đăng nhập; giữ nguyên toàn bộ assert và timeout. Backend chạy lại đạt **507/507**.
AGENTS bổ sung phạm vi nhỏ, chốt thay đổi trước kiểm tra
diện rộng và tôn trọng giới hạn usage; không cài thêm skill/dependency.

### Rà soát core và giới hạn chi phí test — 2026-11-05

Chủ dự án yêu cầu chia hai agent phân tích và xử lý test kéo dài. Mobile/thiết bị thật,
native notification và công nghệ hỗ trợ **ngoài phạm vi hiện tại theo yêu cầu chủ dự án**.
Không yêu cầu chủ dự án làm thêm, không dùng nhiều lượt mô phỏng để bù; các XP liên quan
vẫn partial khi thiếu tiêu chí gốc. Sổ giữ **49 done / 11 partial / 0 planned**.

Hai agent chỉ rà soát core, không sửa sản phẩm và không chạy DB/browser song song.
Nền tảng đã có: gửi idempotent với `clientId`, transaction/row lock, outbox text/ảnh bền,
phân trang, loại response cũ, search theo membership và media renew kiểm quyền. Chưa có
bằng chứng cần thêm feature lớn hoặc thay kiến trúc. Cần ưu tiên các đường phục hồi sau:

| Ưu tiên / phát hiện | Bằng chứng | Điều kiện sửa đạt |
| --- | --- | --- |
| P1: access-token 401 rồi refresh lỗi mạng/5xx vẫn báo hết phiên, có thể dọn outbox — **đã sửa 2026-11-05** | `apps/web/src/api/client.ts:144–165, 221–227`; `hooks/use-auth.ts:116`. Agent chạy probe API client trong bộ nhớ, handler hết phiên bị gọi khi refresh lỗi mạng | Giữ phiên/outbox khi mạng hoặc server lỗi; chỉ logout khi refresh bị từ chối xác thực |
| P1: upload nhận HTML/JSON hỏng làm Promise kẹt — **đã sửa 2026-11-05** | `api/client.ts:273–281, 612–624`; probe 502 HTML ném SyntaxError ngoài Promise, trạng thái vẫn pending | Upload kết thúc pending bằng lỗi có Retry; giữ payload/clientId; deadline cho request treo |
| P1: upload 401 logout ngay dù refresh còn dùng được — **đã sửa 2026-11-05** | Hai XHR path trong `api/client.ts`; probe image upload: handler hết phiên 1 lần, refresh 0 lần | Refresh một lần và gửi lại cùng payload/clientId; chỉ kết thúc phiên khi refresh bị từ chối |
| P1: socket sống không áp lại hạn JWT 15 phút — **đã sửa 2026-11-05** | `apps/server/src/sockets/index.ts:36`; `auth.service.ts:77`, xác thực ở handshake; phát hiện qua code, chưa tái hiện integration | Hết hạn mất quyền nhận sự kiện; refresh/reconnect hợp lệ không mất/trùng tin |
| P1: đọc rooms rồi mới join personal room có cửa sổ bỏ sót remove/reset — **đã sửa 2026-11-05** | `sockets/index.ts:19–24`; eviction/revocation ở `conversations.service.ts:427`, `auth.service.ts:263`; giả thuyết interleaving từ code, chưa có integration | Barrier giữ bootstrap, thu hồi quyền giữa chừng, thả barrier: socket không nhận sự kiện đã mất quyền |
| P2: mail outbox claim 10 thư với lease 120 giây nhưng gửi tuần tự — **đã sửa 2026-11-05** | `lib/outbox.ts:30,58,120,226`; `lib/mailer.ts:80` không cấu hình timeout riêng; nguy cơ gửi lặp khi SMTP chậm, chưa tái hiện integration | Hai worker với SMTP chậm không gửi cùng claim; timeout/lease tương thích, worker cũ không ghi đè claim mới |

Các probe frontend mất khoảng 0,2 giây, không cần browser/thiết bị. Chúng chứng minh nhánh logic,
không thay nghiệm thu tích hợp. Các phát hiện trên **chưa được sửa trong đợt hạ tầng test này**.
Batch core kế tiếp nên gom ba đường phục hồi API client; socket và mail xử lý riêng với test có điều khiển.

Nguyên nhân test tốn thời gian: chính sách từng yêu cầu full Chromium → WebKit → built dù ADR 0019
đã cho phép chạy spec liên quan; không có deadline cho cả lượt, giới hạn số lỗi hoặc chặn E2E
trùng database; worker web mặc định có thể dùng quá nhiều tài nguyên. Báo cáo cũ ghi nhận máy ngủ,
thiếu RAM và chạy lại nhiều batch. Các số thời gian cũ không phải benchmark của mã hiện tại.

Đợt này chỉ sửa ba nhóm:

1. Supervisor không thêm dependency: verify 5 phút, full/unit 10 phút, smoke 3 phút, full browser
   15 phút, built 5 phút; in thời gian từng bước, dừng ở bước lỗi, timeout exit 124, Ctrl-C exit 130;
   dọn cả worker/browser/server tách process group, thêm tối đa 5 giây cleanup.
2. Smoke dùng lại **7 ca** từ chat/sending/outbox; full suite còn nguyên. Browser local dừng sau
   3 lỗi, smoke sau 1, không retry; PostgreSQL advisory lock giữ suốt lượt E2E, migration timeout 60 giây.
   Web unit mặc định 2 worker local; CI vẫn full và có deadline theo job.
3. Đồng bộ AGENTS/CLAUDE/README/CONTRIBUTING/ADR: một gate cho batch đã đóng băng,
   browser chọn theo thay đổi; không tự chạy cả ma trận hoặc lặp suite xanh. Thiết bị thật ghi giới hạn.

Bằng chứng ngày 2026-11-05 trên macOS arm64, Node 26.13.0, npm 11.20.0,
PostgreSQL 16 qua Docker/OrbStack:

| Lệnh / kiểm tra | Kết quả thực tế |
| --- | --- |
| `npm run test:tooling` | 5/5 đạt, khoảng 2,4 giây; exit code, timeout chung, child/descendant tách process group, Ctrl-C và chặn bước sau lỗi |
| `npm run verify` | Exit 1: static checks đạt, server 507/507 đạt trong 138,82 giây; web 571 đạt/82 lỗi do Node 26 che storage của jsdom. Không gọi gate này là pass |
| `npm run test --workspace apps/web` sau sửa config | 653/653 đạt, 26,52 giây. Tắt Node experimental webstorage trong worker để jsdom sở hữu browser storage; không sửa logic sản phẩm |
| Kiểm tra phần thay đổi sau gate | Prettier/ESLint config web đạt; `npm run typecheck:e2e` đạt; `npm run verify:audit` đạt, 0 hit. Không chạy lại server đã đạt |
| Probe setup E2E qua `tsx`, PostgreSQL thật | Gọi setup lần hai khi đang giữ lock bị từ chối; teardown rồi claim lại đạt; chỉ dùng `chatty_e2e` |
| `npm run test:e2e:smoke -- --list` | Đúng 7 ca trong 3 file; full suite giữ nguyên |
| `npm run test:e2e:smoke` | 7/7 đạt; Playwright 24,0 giây, supervisor đo toàn lượt 24,2 giây |

Chốt theo yêu cầu người dùng, không chạy thêm suite. Không chạy full Chromium/WebKit/built hoặc
thiết bị thật trong đợt này. Cleanup Windows mới được review code, chưa chạy trên Windows.
Không commit/push, không đổi env hoặc dữ liệu dev. Các phát hiện core vẫn là việc cần sửa tiếp.

### Sửa ba đường phục hồi API client — 2026-11-05

Gom vào `apps/web/src/api/client.ts`, không thêm dependency:

- Refresh có ba kết quả: gia hạn được, bị từ chối, không liên lạc được (mạng/5xx/2xx không phải JSON).
  Chỉ "bị từ chối" mới kết thúc phiên; còn lại ném `NetworkUnavailableError`, giữ phiên và outbox.
- Ba đường upload (ảnh, file, voice) dùng chung một hàm: 401 gia hạn rồi gửi lại đúng body/`clientId`
  một lần; phản hồi không phải JSON, 5xx từ proxy và kết nối đứng yên 60 giây đều kết thúc bằng lỗi.

| Lệnh | Kết quả |
| --- | --- |
| `vitest run tests/session-expiry.test.ts tests/upload-recovery.test.ts` | 17/17 đạt; với `client.ts` cũ có 6 ca mới lỗi (3 ca treo tới timeout) |
| `npm run verify` (macOS arm64, Node 26.13.0) | Đạt trong 185,7 giây: server 507/507, web 661/661, audit 0 hit |

### Sửa socket và mail outbox — 2026-11-05

Cả ba đều được tái hiện bằng test thất bại trên code cũ trước khi sửa:

- **Socket quá hạn token:** middleware ghi lại `exp` của token đã xác thực; tới hạn, server đóng
  kết nối (không gửi DISCONNECT) để client tự gia hạn và vào lại.
- **Race khi vào phòng:** join personal room trước, đọc danh sách, join, đọc lại và rời phòng đã mất quyền.
- **Mail gửi trùng:** claim từng thư ngay trước khi gửi; `attempts` làm token claim nên worker trễ không
  ghi đè claim mới; timeout SMTP (5/10/10/10 giây) giữ một lần gửi dưới lease 120 giây (ADR 0011).

| Lệnh | Kết quả |
| --- | --- |
| `vitest run tests/typing.socket.test.ts tests/outbox.test.ts` | 31/31 đạt; code cũ: socket 2 lỗi, outbox 2 lỗi |
| `npm run verify` (macOS arm64, Node 26.13.0) | Đạt trong 141,7 giây: server 472/472 liên quan, audit 0 hit |

Giới hạn còn lại: đăng xuất một thiết bị chỉ cắt socket khi access token hết hạn (tối đa 15 phút, như HTTP);
SMTP gửi nhỏ giọt liên tục vẫn có thể vượt lease (gửi trùng hiếm, không ghi đè trạng thái); chưa thử SMTP chậm thật.

### Sửa theo review — 2026-11-06

Review độc lập tìm ra ba khe hở trong hai đợt trên; mỗi khe có một test thất bại trên code trước đó:

- Handshake bị từ chối làm socket ngừng hẳn; client nay `connect()` lại sau khi gia hạn thành công.
- Refresh trả 429 từng bị coi là hết phiên; nay chỉ 401 mới kết thúc phiên.
- Refresh không có deadline nên upload chờ 401 có thể treo; nay refresh dừng sau 15 giây.

Bỏ code không còn nơi dùng: `CustomSelect`, `useAnimatedDismiss`, `useMotionPresence`, `constants/motion.ts`
và CSS `data-motion` đi kèm. `npm run verify` đạt trong 160 giây (server 472/472, web 451/451 liên quan, audit 0 hit).

### Cổng phát hành v0.2.0 — 2026-11-06

| Lệnh | Kết quả |
| --- | --- |
| `npm run verify:full` | Đạt trong 172,9 giây: server 511/511, web 661/661, audit 0 hit |
| `npm run test:e2e` | 105/106; ca phím Tab tới nút tốc độ voice lỗi khoảng 1/2 lần: nút còn `visibility: hidden` ở đầu transition. Đã sửa CSS; chạy riêng ca đó 8/8 đạt |
| `docker compose -f docker-compose.prod.yml up --build --wait` (project tạm, secret dùng một lần) | Hai image build được, mọi service healthy |
| `scripts/smoke.sh http://127.0.0.1:4000` | 17/17 đạt; web 200 kèm CSP; stack tạm đã gỡ cùng volume |

### v0.2.0 không phát hành → v0.2.1 — 2026-11-06

Workflow release của tag `v0.2.0`: CI gate đạt, browser 105/106. `vault-live-pages` lệch 2290px trên runner
chậm: vault bỏ qua thao tác cuộn trong lúc tải lại, xong lại kéo người đọc về vị trí cũ. Image và GitHub Release
bị chặn đúng thiết kế. Đã sửa hook (ghi vị trí cả khi đang tải, trừ danh sách rỗng), thêm unit test (lỗi trên
code cũ). `npm run verify` đạt (166/166 liên quan), `vault-live-pages` 4/4. Tag không dời; phát hành `v0.2.1`,
workflow release chạy lại toàn bộ gate và E2E trước khi publish.

### Reaction, bảng màu và avatar theo phản hồi giao diện — 2026-11-07/08

Chủ dự án báo reaction lệch ở mobile, dư viền, avatar có nền/khung vuông và chữ lệch tâm. Đã thử
nhiều phương án (viên nổi, giọt nước…) trên app thật và 6 mẫu dựng (Messenger, iMessage, WhatsApp,
Telegram, Instagram, Slack); chủ dự án chọn **D — chip trong bong bóng**, bộ icon vẽ tay theo phong
cách "Bubbles" (tự vẽ, không dùng file Icons8 vì repo MIT), bảng màu **A — mực & pastel** và avatar
trống kiểu Facebook. Chip: emoji vẽ tay + số, bấm để bật/tắt, của mình tô mực; tối đa 3 + `+N`, một
hàng. Touch: chip 28px, vùng chạm 44px chủ yếu kéo xuống (Chromium kéo cú chạm "Hi" sang chip khi vùng
chạm lấn lên chữ) và không xuống hàng (hàng thứ hai nằm trong vùng chạm hàng trên — test bắt được ở
320px). Bỏ `getInitials`/`getAvatarColor`.
Kiểm tra: `npm run verify` xanh; web 655 test xanh; e2e touch-targets, reactions-and-replies,
completion-states, message-action-recovery, keyboard-accessibility, menu-viewport, mobile-experience,
compact-receipts, chat-theme, appearance, profile-recovery, sidebar-organisation xanh (Chromium).
keyboard-accessibility từng trượt 1 lần (dialog Forward không mở) trước đợt này, chạy lại đều xanh —
chưa rõ nguyên nhân. Ảnh README (`docs/images/hero.webp`) chụp lại theo giao diện mới. Bỏ thanh dọc đánh dấu dòng chat đang chọn và mục Settings đang
chọn (giữ màu nền + `aria-current`); verify, sidebar-organisation, account, keyboard-accessibility,
appearance xanh. Thêm bộ màu (ink, clay, ocean, forest, graphite) và trang Appearance
kiểu Claude (thẻ xem trước chế độ + bộ màu); `data-palette` gán trước lần vẽ đầu. Không xem được nội
dung video tham khảo (chỉ tiêu đề). verify, appearance, account, entry-layout, chat-theme xanh. Nền chat chảy kiểu Telegram
(tự viết: 4 màu trên vòng 8 điểm, xoắn khi chuyển, một bước mỗi tin gửi; đêm: gradient chỉ lộ qua
hoa văn) và bộ chọn theme có thumbnail. Lỗi tìm thấy khi chạy: khung rAF đầu có thể sớm hơn mốc bắt
đầu → chỉ số vòng âm → crash; đã kẹp tiến độ và quấn chỉ số, có unit test. Seed chỉ còn 1/2/3@test.com
(mật khẩu `1`); bản dev cho đăng nhập `1`. verify, chat-theme, sending, reactions-and-replies,
mobile-experience, scroll-history, reading-position, attachments-and-vault, touch-targets, smoke xanh. Xem trước theme trên
điện thoại / máy tính: hội thoại mẫu tự gửi tin để thấy nền chảy; cửa sổ desktop vẽ 544×340 rồi thu
nhỏ cả khối cho vừa (lỗi bắt được: ResizeObserver gắn bằng ref object không đo lại khi đổi từ Phone
sang Desktop — đổi sang callback ref; góc màn hình lòi do lớp blur — `clip-path`). Font hệ thống kiểu Telegram (bỏ mono cho
handle/giờ/số; gỡ 3 gói font không dùng), sidebar gọn (một hàng đầu, chip Notes/Bookmarks, dòng có giờ
cạnh tên), xem trước tin kiểu nhấn giữ: chạm giữ 420ms trên touch, chuột phải trên desktop, Menu /
Shift+F10 từ bàn phím — e2e mới `message-peek.spec.ts`. Lỗi test bắt được: bấm phải khi tin còn đang
gửi thì không có thao tác (đúng thiết kế) — test chờ "Sent/Seen". verify; message-peek, touch-targets,
mobile-experience, sidebar-organisation, design-polish, keyboard-accessibility, menu-viewport,
reactions-and-replies, interaction-baseline, compact-thread, entry-layout, chat-theme xanh. Theo phản hồi, bỏ
"nổi tin nhắn" (chuột phải/nhấn giữ trên tin) và thay bằng **xem trước cuộc chat không đánh dấu đã
xem**: chỉ `GET` lịch sử, không `POST /read`. Touch: giữ dòng chat 420ms → sheet; desktop: nút 👁 rõ
ràng trên dòng + mục "Preview" trong menu → panel cạnh sidebar. E2E mới `conversation-preview.spec.ts`
chứng minh người gửi vẫn thấy "Sent" khi xem trước và chuyển "Seen" khi mở chat. verify; e2e
conversation-preview, sidebar-organisation, design-polish, keyboard-accessibility, menu-viewport,
mobile-experience, notification-policy, touch-targets xanh.

### Đợt 1–6 theo phân tích Telegram — 2026-11-09

Avatar: người chưa có ảnh = bóng người xám (Messenger), nhóm = icon nhóm trên gradient theo id.
Xem trước chat: bỏ nút mắt; desktop mở bằng chuột phải hoặc "Preview" trong menu "…". Ghim: thanh có
vạch đếm + chuyển vòng, huy hiệu 📌 trên bong bóng, icon 🔇/📌 trên dòng chat, bong bóng nháy khi
nhảy tới. Bong bóng: đuôi, giờ + ✓/✓✓ trong bong bóng, hiệu ứng gửi, vuốt trái để trả lời, nhấp đúp
❤️. Chấm online, nhãn ngày dính khi cuộn, thư mục chat, chọn nhiều tin (copy / xoá phía mình), sticker
động dựng sẵn (migration `20261109090000_builtin_sticker_key`), emoji 🎉❤️👍 nổ toàn màn hình.
Hiệu năng: bỏ lớp mờ khi `prefers-reduced-transparency`, nền chảy không chạy khi tab ẩn.
**Đã thử và bỏ** `content-visibility: auto` cho tin: `reply-reading-position` lệch neo đọc vì chiều
cao ước lượng — giữ chính xác vị trí đọc quan trọng hơn.
Lỗi bắt được khi chạy: đuôi bong bóng làm tràn ngang (chừa lề 7px); hook thu gọn chưa tính giờ trong
bong bóng; hiệu ứng gửi chạy lại (tự gỡ khi xong); thanh chọn che tin cuối (thay chỗ ô nhập);
test khay sticker chờ cả hiệu ứng lặp vô hạn (chỉ chờ hiệu ứng hữu hạn).
Kiểm tra: `verify:full` xanh (server 513, web 662); e2e mới `chat-extras.spec.ts`; e2e
compact-thread, compact-receipts, sending, touch-targets, mobile-experience, reactions-and-replies,
pinned-messages, conversation-preview, sidebar-organisation, sticker-tray-recovery, design-polish,
scroll-history, reading-position, reply-reading-position, conversation-paging và smoke xanh. Chưa
chạy full `test:e2e`.

### Rút thời gian kiểm tra — 2026-11-10

`verify:full` từ ~200s xuống ~62s, không bớt test nào (server 513, web 662). Đo từng bước: test server
150s là nút thắt vì chạy tuần tự trên một DB chung. Sửa: mỗi worker một DB nhân bản từ `chatty_test`
đã migrate (`CREATE DATABASE … TEMPLATE`, 4 worker) và thư mục upload riêng; bcrypt mức 4 khi
`NODE_ENV=test` (production giữ 12); test server và test web chạy song song trong `verify`
(`run-check` hỗ trợ bước `{ parallel }`); web 4 worker. Thử 6 worker server: chỉ nhanh thêm ~3s.
Lỗi bắt được khi thử: 6 worker dùng chung thư mục upload làm hỏng test ảnh — đã tách theo worker.
Chạy server 5 lần liên tiếp đều xanh. Giới hạn còn lại trên máy này là CPU/Postgres khi hai bộ chạy
cùng lúc (~50s).

### Tái cấu trúc để mở rộng — 2026-11-11

Web: `features/chat` tách 8 sub-feature, CSS tách theo khu vực màn hình, API client tách theo tài
nguyên, hook tin nhắn/danh sách tách theo trách nhiệm. Server: service conversations/messages tách
theo trách nhiệm, file cũ chỉ còn re-export. E2E chạy song song 2 worker, mỗi worker server/DB/upload
riêng. macOS, Chromium, máy rảnh:

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run` (apps/server) | 40/40 file, 513/513 test, 25s |
| `npm run verify:full` | Đạt, 52s, audit 0 hit |
| `npm run test:e2e:smoke` | 7/7, 15s |
| `npm run test:e2e` | 107/109 lần hai (~5 phút); 2 lỗi còn lại đã sửa và chạy lại riêng đạt |
| Ảnh chụp dev 1440px và 390px | Đăng nhập, danh sách, thread, popover xem trước hiển thị đúng sau khi tách CSS |

Lỗi tìm ra và đã sửa: fixture voice còn trỏ cứng cổng 4100 (sai khi nhiều worker); menu hội thoại
trả focus về mục đầu ("Preview") thay vì mục vừa bấm khi thao tác lỗi; spec welcome chọn ô email
theo `type="email"`, trong khi bản dev dùng `type="text"` để đăng nhập bằng `1`. Còn chập chờn khi
2 worker cùng chạy (chạy riêng đều đạt): phát voice tới hết bằng bàn phím (audio dừng ở 7.7/8s) và
pinned-messages một lần. Chưa thêm retry theo quy tắc; ghi lại để theo dõi.

### Thoại, avatar và 10 quy tắc Innovaccer — 2026-11-11

Thoại kiểu Telegram (trong bong bóng, giờ/tick, disc đặc, độ dài theo thời lượng); `AvatarGroup` (≤3 mặt, rồi 2 + "+N"),
ảnh nhóm ghép 2 mặt thành viên; skeleton trễ 300ms; `TooltipLayer` chung; trạng thái trống theo nguyên nhân;
`getErrorMessage` (không lộ chữ 5xx/mạng); nút nhảy tới tin chưa đọc; menu có vạch ngăn trước mục nguy hiểm; một
kiểu focus; số chưa đọc xám khi tắt thông báo; thang cỡ chữ. macOS, Chromium:

| Lệnh | Kết quả |
| --- | --- |
| `npm run verify` | Đạt, 42s, audit 0 hit; web 668 test |
| `npm run test:e2e` | 107/109; còn pinned-messages chập chờn khi 2 worker (chạy riêng đạt) và scroll-history đã sửa kỳ vọng rồi chạy riêng đạt |
| Ảnh chụp dev 390/1280px | Thoại trong bong bóng, ảnh nhóm ghép (khe cắt trong suốt), tooltip, trạng thái trống, skeleton, menu tin nhắn |

E2E giả lập 5xx kèm câu tùy ý được đổi sang kỳ vọng câu dự phòng của client — đó chính là hành vi mới cần giữ.
Chưa kiểm: nút "N new messages" chỉ kiểm bằng tay qua code, chưa có spec riêng.

### Bộ demo tính năng và nút nhảy tin chưa đọc — 2026-11-11

`seed:demo` viết lại thành tour ngắn qua API thật (ảnh User 2/3, mọi loại tin, nhóm ảnh ghép + 13 tin chưa đọc,
nhóm tắt tiếng có ảnh riêng, chat ghim, lưu trữ, ghi chú); bản dài sau `-- --long`. Chụp dev 1280px với User 1:
ảnh đại diện, ảnh nhóm ghép, số xám, nút "13 new messages", đủ loại tin trong chat User 2.

Lỗi tìm ra khi chạy thật và đã sửa: (1) nút nhảy tin chưa đọc không bao giờ hiện — thread vẽ ở đầu một nhịp trước
khi cuộn xuống, nên vạch bị tính là đã thấy; giờ chờ 600ms mới theo dõi. (2) Nút nằm dưới header kính nên không
bấm được; giờ đặt dưới header và nhãn ngày. (3) Ảnh nhóm vẽ bằng emoji thành khối đen (renderer SVG của server
không có font emoji); đổi sang hình vẽ. Spec mới `e2e/unread-jump.spec.ts` đạt 3/3.

| Lệnh | Kết quả |
| --- | --- |
| `npm run verify` | Đạt, 41s, audit 0 hit |
| `npm run test:e2e` | 110/110, 3,5 phút |
| `pinned-messages` + `keyboard-accessibility` `--repeat-each 4`, kèm tải CPU | 12/12; `pinned-messages --repeat-each 6` 6/6 |

Lỗi vạch định vị ghim đã tìm ra và sửa ở mục rà soát cuối bên dưới; lỗi phát voice tới hết chưa tái hiện lại.

### Bố cục hàng chat sidebar — 2026-11-11

Cột phải một khối (tick + giờ xám / số, "@", ghim), chuông ngay sau tên, ⋯ thay cả cột khi hover, có làn riêng
trên cảm ứng. Chụp 1280px (thường, hover) và 390px cảm ứng với dữ liệu `seed:demo`. `npm run verify` đạt (39s,
audit 0); `npm run test:e2e` 110/110 (3,3 phút); thêm 2 unit test (tick đọc theo chia sẻ receipt, số xám khi tắt tiếng).

### Rà soát cuối trước khi đẩy — 2026-11-11

Lỗi chập chờn của `pinned-messages` tái hiện được với `CHATTY_E2E_WORKERS=4` và là lỗi app: nhảy tới tin thứ hai
khi lần nhảy đầu còn đang tải, phản hồi muộn của lần đầu thay cả cửa sổ và kéo người đọc về. Sửa: nhảy thành công
trong lúc còn tải sẽ đổi đích (`use-conversation-navigation.ts`), effect lịch sử bỏ phản hồi cũ. Spec tất định mới
(giữ chậm request context) trượt khi gỡ bản sửa, đạt khi có. Ngưỡng 300 dòng của `chat-page.tsx` bị vượt 1 dòng —
gom hai handler trùng thành `openMessageIn`.

| Lệnh | Thời gian | Kết quả |
| --- | --- | --- |
| `npm run verify:full` | 46s | Đạt — server 513, web 670, audit 0 |
| `npm run test:e2e:smoke` | 15s | 7/7 |
| `npm run test:e2e` (2 worker) | 4,0 phút | 111/111 |
| `CHATTY_E2E_WORKERS=4 npm run test:e2e` | 2,8 phút | 109/110 trước bản sửa — chỉ nhanh hơn ~30s nên giữ mặc định 2 |

### Giờ khi hover và menu dưới header — 2026-11-11

Khôi phục giờ hiện khi hover bên cạnh bong bóng (bỏ giờ/tick trong bong bóng chữ và thoại; test gốc trước đợt
Telegram được khôi phục). Menu thao tác tin mở sát header: hàm giữ menu dùng mép trên của vùng cuộn, nhưng header +
pin nổi phủ lên đó, nên menu nằm dưới header hoặc focus kéo thread đi 302px. Giờ giới hạn bằng
`getMessageViewportTop` và lật xuống dưới khi không đủ chỗ. Spec mới trong `pinned-messages.spec.ts` trượt với code
cũ (lệch 302px), đạt với code mới.

### Đo JSON so với binary trước khi đổi định dạng — 2026-11-11

Theo ADR 0016 (binary chỉ khi số đo chứng minh). Dữ liệu `seed:demo`, API dev; "bỏ key" mô phỏng mức một schema
binary kiểu Kiwi đạt được (chỉ còn giá trị):

| Payload | JSON | gzip | Brotli | Bỏ key | Bỏ key + Brotli |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 tin chữ (socket, không nén) | 616 B | 382 | 320 | 335 | 214 |
| 1 tin thoại | 1 262 B | 760 | 669 | 877 | 514 |
| Trang lịch sử 20 tin (HTTP, đã nén) | 15 461 B | 2 356 | 2 027 | 9 400 | 1 767 |
| Danh sách 5 hội thoại | 9 872 B | 1 935 | 1 637 | 5 575 | 1 316 |

HTTP đã nén Brotli: binary chỉ bớt ~260 B/trang (13%). Socket: bớt ~280 B/tin — 1 000 tin ≈ 280 KB. Phần lớn byte
là dữ liệu lặp (`author` 27% trang, URL ký của `attachments` 22%), thứ nén đã xử lý. Kết luận: chưa đủ để đổi.

### Các bước cần thiết bị thật để đóng ma trận (tham khảo, ngoài phạm vi hiện tại)

Ghi model thiết bị, OS/browser, ngày, pass/fail và lỗi cụ thể cho mỗi bước. Chưa chạy
không được ghi pass; mô phỏng viewport/CDP/Notification recorder không thay các bước này.

| XP | Kiểm tra thật còn lại | Kết quả cần đạt |
| --- | --- | --- |
| 02, 03 | Gõ Telex/composition, giữ Enter, Shift+Enter, dán nhiều dòng; bật keyboard ảo và bàn phím vật lý, kèm reply + 2 ảnh | Không gửi trong composition/không gửi lặp; giữ chữ/reply/ảnh; ô soạn cuộn riêng, Send luôn dùng được |
| 13, 49 | Chọn/copy một phần chữ, chạm menu/reaction, bỏ từng ảnh và sticker bằng một tay | Không mất vùng chọn, không mở nhầm thao tác hoặc chạm hai nút; giữ nội dung chưa gửi |
| 20 | Cho phép/từ chối/thu hồi quyền native; nhận tin khi 2 tab ẩn, tắt preview, bấm popup và logout | Một popup, không lộ preview đã ẩn, mở đúng thread, hướng dẫn quyền rõ và dọn popup khi được API hỗ trợ |
| 34 | Ảnh rất dọc/ngang, caption dài, album 10 ảnh; zoom/pan, xoay màn hình và đóng viewer | Không che Close; ảnh/điều khiển dự đoán được; trở về đúng ảnh mở, không cuộn nền ngoài ý muốn |
| 46 | Mở/đóng keyboard khi đang đọc tin cũ; xoay ngang, co giãn thanh địa chỉ, text zoom, home indicator | Không che composer/Send; giữ hàng tin đang đọc và nháp; tránh notch/home indicator |
| 51, 52 | Đi sidebar → gửi/reply/reaction/search/forward/voice seek bằng bàn phím; nghe VoiceOver/NVDA hoặc TalkBack | Không kẹt focus; tên/role/state đúng; thông báo tin mới một lần, không đọc lại lịch sử hoặc cướp focus |
| 58 | Safari thật: mở built web online, lưu nháp, offline rồi reload; mở settings; online lại; cập nhật shell khi tab cũ còn mở | Nháp được hỗ trợ còn nguyên; media offline không giả phát; không ghép assets cũ/mới hoặc ngắt việc đang làm |
| 60 | Hoàn tất các bước trên và ghi lỗi/retest, đối chiếu lại toàn bộ sổ XP | Chỉ đổi done cho từng XP khi mọi tiêu chí của chính XP đó có bằng chứng |

## Cập nhật 2026-10-26: WebKit toàn bộ, offline, Safari

Sổ XP sau đợt này: **49 done / 9 partial / 2 planned** (XP-46, XP-49 cần điện thoại).
Các thay đổi nằm ở ROADMAP phase 54–59; mục này chỉ ghi bằng chứng hiện tại.

| Cổng | Kết quả | Ghi chú |
| --- | --- | --- |
| `npm run verify` | Đạt | web 438 test liên quan, audit 0 hit |
| Full Chromium e2e | **100/100** (6,5 phút) | Máy thức, không retry |
| Full WebKit e2e | **92 đạt, 1 bỏ qua có chủ ý** (53 file, chạy 5 đợt ngày 27/10) | Mọi lỗi đều đạt khi chạy riêng; spec bookmark mới đã sửa (chọn nhầm menu hàng khác). Còn 2 lỗi chập chờn khi chạy nối tiếp: `reactions › a second emoji…`, `restrictions › one badge rule…` (chờ màn chat sau đăng ký quá 15 giây; context cô lập đúng, đăng ký đo 0,8 giây; chưa rõ nguyên nhân) |
| WebKit từng spec | Đạt sau sửa | affordances, compact-thread, composer-input-boundaries, entry-layout, group, editor-expiry, offline-actions, menu-viewport, reactions, restrictions, blocking, conversation-actions, design-polish |
| Built web trên WebKit | Đạt tới trước bước offline | Playwright WebKit không reload offline được khi có service worker |

Lỗi Safari thật đã sửa: menu thao tác thành viên nhóm đóng trước khi nhận click ("Make admin",
"Remove from group" không có tác dụng); bong bóng gọn thừa 26–60px vì `text-wrap: pretty`.
Còn nợ: tìm nguyên nhân 2 lỗi chập chờn WebKit; kiểm tay shell offline trên Safari desktop;
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

Danh sách hiện hành lấy từ sổ XP; các kiểm chứng lịch sử phía trên không tự đổi trạng thái.
Ngày 2026-11-05 chủ dự án xác nhận chưa có thiết bị thật để thử. XP-46 và XP-49 đã
triển khai phần mềm, chuyển từ planned sang partial. Hiện còn **11 mục chưa done**:

| Nhóm việc còn lại | XP |
| --- | --- |
| Composer/IME và tương tác menu/chọn văn bản trên thiết bị | 02, 03, 13 |
| Notification native và quyền trình duyệt trên thiết bị thật | 20 |
| Viewer ảnh khó, touch và xoay màn hình | 34 |
| Mobile keyboard/safe area và vùng chạm một tay | 46, 49 |
| Bàn phím xuyên suốt và công nghệ hỗ trợ | 51, 52 |
| Shell offline Safari và nghiệm thu tổng thể trên thiết bị thật | 58, 60 |

Các mục này có cả công việc phần mềm và kiểm chứng, không phải “chỉ còn deploy”.
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
