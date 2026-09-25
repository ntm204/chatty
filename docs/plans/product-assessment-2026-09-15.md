# Chatty — đánh giá sản phẩm và thứ tự triển khai

Ngày lập: **2026-09-15**. Cập nhật: **2026-09-20**. Được chủ dự án yêu cầu lưu và bắt đầu triển khai.

## Kết luận

Chatty đã vượt MVP, đang hoàn thiện bản nghiệm thu nội bộ `0.2.0-rc.1`.
Roadmap có 52 phase đã hoàn thành và các đợt polish sau đó; không dùng số phase
để suy ra tỷ lệ sẵn sàng production. Chưa có dữ liệu sử dụng thực tế trong lần
đánh giá này để kết luận về retention hay product-market fit.

Ưu tiên: **soạn → gửi → nhận → đọc → tìm lại** phải đáng tin cậy. Giữ định hướng
messenger tập trung vào quan hệ, dùng được trên điện thoại phổ thông, hạn chế hóa
đơn dịch vụ định kỳ. Kế hoạch này bổ sung thứ tự ưu tiên cho
[60 đầu việc trải nghiệm](experience-polish.md), không thay đổi trạng thái các ID
khi chưa nghiệm thu hết tiêu chí.

## Tiến độ hiện tại — 2026-09-20

**15/60 XP đã nghiệm thu, 15 partial, 30 planned.** Đợt này hoàn tất phần triển khai cho reply-context,
notification nhiều tab, bàn phím tìm trong hội thoại và replay outbox ngoài thread mở; chúng vẫn là `partial`
cho đến khi hoàn thành matrix browser/thiết bị còn lại. Đây là số mục theo tiêu chí, không phải tỷ lệ sẵn
sàng production. Kết quả chi tiết cuối tài liệu và trong [sổ XP](experience-polish.md).

Phần tiếp theo: trạng thái bookmark chung/multi-tab, Back giữ vị trí đọc sau context jump, nghiệm thu native
notification/replay ở hai tab, offline app shell, ma trận mobile/IME/Safari và đo hiệu năng.

## Đánh giá ban đầu từng nhóm tính năng

Bảng này ghi khoảng trống trước khi triển khai. Kết quả hiện tại nằm trong các đợt
triển khai bên dưới và sổ theo dõi XP; không dùng bảng ban đầu để suy ra lỗi còn tồn tại.

| Tính năng | Đã có / khoảng trống | Hành động đề xuất |
| --- | --- | --- |
| Chat riêng, nhóm, realtime | API, socket, lịch sử phân trang | Kiểm thử reconnect, hai người dùng và nhiều tab |
| Composer | Một dòng; đường Enter/editor chưa bảo vệ IME đầy đủ | Nhiều dòng, chiều cao có giới hạn, Enter/Shift+Enter và composition |
| Nháp | Khôi phục và sidebar preview; khóa chỉ có conversation ID | Tách tài khoản, cleanup trước unmount, bỏ nháp legacy không rõ chủ |
| Gửi/retry | Optimistic, outbox chữ/ảnh, client ID chống trùng | Không đè nháp mới khi request cũ thất bại; trạng thái rõ |
| Reply | Quote và nhảy về tin gốc | Xử lý mất quyền/thu hồi và giữ vị trí đọc |
| Edit/history/delete | Có giới hạn 8 giờ; history còn sau thu hồi | Dọn history cùng transaction, chặn đọc tombstone, dọn dữ liệu cũ |
| Emoji/reaction/mention | Có | Chèn đúng caret, cảm ứng/bàn phím, quy tắc mention/mute |
| Forward | Chỉ thấy các hội thoại đã tải ở sidebar | Tìm người nhận phía server |
| Pins | Thanh ghim, dialog, preview và jump | Lỗi tại chỗ và đồng bộ thu hồi |
| Ảnh/album | Caption, thumbnail, giảm kích thước và server re-encode | Preview production, retry, mạng chậm |
| Image viewer | Zoom, pan, rotate, download | Touch/keyboard và giải phóng bộ nhớ |
| File | Tiến độ, retry/remove; chọn file gửi ngay | Giữ nháp chữ/reply; lỗi rõ; không hứa lưu bền qua reload |
| Voice | Ghi/nghe thử, waveform, seek, speed, retry trong phiên | Safari/iPhone, microphone, gián đoạn; preview production |
| Sticker | Lưu/xóa/gửi cá nhân | Phản hồi lỗi và giữ nháp; chưa cần marketplace |
| Vault | Ảnh/file/audio/link theo hội thoại | Tìm file theo tên và nhảy đúng nguồn |
| Saved | Self-chat shortcut; backend còn cơ chế bookmark | Phân biệt ghi chú cá nhân với tin đánh dấu từ hội thoại khác |
| Search | Không phân biệt dấu, backend xuyên hội thoại | Điểm vào toàn tài khoản; sau đó lọc sender/date/type |
| Scroll/read/unread | Giữ vị trí, paging, receipts và badges | Đọc theo vùng nhìn thực; không kéo người đọc khỏi lịch sử |
| Presence/typing | Có realtime và privacy | Nhiều tab, disconnect, trạng thái cũ |
| Archive/pin/mute | Có; 5 pin sidebar | Pending/error, mute hết hạn, đường vào Archived |
| Notifications | Popup/âm thanh khi trang nhận socket | Thống nhất restrict/mute/mention; Web Push ở giai đoạn kế tiếp |
| Appearance/mobile | Theme, nickname, responsive, resizable panels | Touch, focus, contrast, keyboard/safe area |
| Account/session | Đổi/reset credentials, xóa tài khoản, refresh/revoke | Autofill, mail thực; sau đó UI quản lý thiết bị |
| Block/restrict/groups | Có; admin/member; block không cấm ở nhóm chung | Copy rõ, quyền thay đổi trong phiên, invitation acceptance |
| Offline | IndexedDB snapshots, outbox chữ/ảnh, shell service worker | Đúng tài khoản, app update, trạng thái cache và quyền sau reconnect |
| E2EE | Quyết định thiết kế, chưa triển khai | Dự án riêng về giao thức, thiết bị, khôi phục và review |
| Operations | CI, metrics, logs, Docker, backup/restore | Built-web với API, off-host restore, đo tải; một host vẫn là điểm lỗi chung |

## Thứ tự triển khai

| Đợt | Phạm vi | Tiêu chí |
| --- | --- | --- |
| 1 | XP-01, XP-11, XP-31 | Không lẫn nháp; không đọc history thu hồi; ảnh/voice preview chạy trên policy production |
| 2 | XP-02–04, các phần XP-06–10, XP-14 | Multiline/IME, giữ nháp và phục hồi lỗi; không gửi lặp |
| 3 | Search toàn cục, Saved, forward | Tìm ngoài hội thoại hiện tại; Saved rõ; forward ngoài trang sidebar |
| 4 | Mobile, accessibility, offline, hiệu năng | Ma trận pass/fail theo thiết bị; tối ưu từ số đo |
| 5 | Dùng thử thực tế và Web Push/PWA | Đo lỗi gửi, mất nháp, khả năng tìm lại và phản hồi |

Không commit, push hay public deploy nếu chưa được yêu cầu riêng. Các đợt có thể
triển khai liên tiếp trong cùng lượt làm việc; trạng thái chỉ đổi theo bằng chứng.

## Tính năng mới theo giá trị

1. **Web Push/PWA:** nhận tin khi đóng tab, deep link đúng hội thoại, subscription
   theo thiết bị và cleanup logout, tuân thủ mute/restrict/privacy.
2. **Search + Saved:** tận dụng API hiện có, một điểm tìm xuyên hội thoại, danh sách
   bookmark rõ nguồn; bộ lọc và nhãn chỉ bổ sung sau.
3. **Message requests / chấp nhận mời nhóm:** chấp nhận, bỏ qua, chặn; không phát
   read receipts trước chấp nhận.
4. **Quản lý thiết bị/phiên:** nhận diện phiên hiện tại, hoạt động gần nhất, revoke
   từng phiên hoặc các phiên khác.
5. **Link/QR:** kết nối bạn bè; invite nhóm hết hạn/thu hồi và theo quyền nhóm.
6. **Tiện ích nhóm nhỏ:** poll hoặc nhắc lại tin, chọn từ phản hồi dùng thử.

Để sau: calls/video (cần nhu cầu và ngân sách), communities/channels (khi nhóm
không đủ), AI (nhu cầu và cơ chế dữ liệu/chi phí), native (giới hạn web đã đo).
E2EE là dự án riêng; feed/stories chưa hợp trọng tâm.

## Nguồn và giới hạn kiểm chứng ban đầu

- Repository: README, ROADMAP, PRODUCT-DIRECTION, schema, API, hooks và component.
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API): nhận
  push khi trang không còn được tải qua service worker.
- [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/):
  điều kiện Home Screen trên iOS/iPadOS.
- [Telegram Saved Messages](https://telegram.org/blog/new-saved-messages-and-9-more):
  tham khảo tổ chức nội dung lưu theo nguồn.
- [Signal Message Requests](https://support.signal.org/hc/en-us/articles/360007459591-Signal-Profiles-and-Message-Requests):
  tham khảo kiểm soát hội thoại mới.
- Lượt đánh giá: 47 test/5 file frontend pass; chưa chạy lại toàn server/E2E hoặc
  deployment. Đây không phải bằng chứng các khoảng trống đã được sửa.

## Nhật ký triển khai

| Phần | Trạng thái | Kiểm chứng |
| --- | --- | --- |
| Lưu đánh giá và kế hoạch | Done | Tài liệu này |
| Tách nháp theo tài khoản | Done | Hook/cleanup/sidebar, late writes và Chromium hai tài khoản pass |
| Thu hồi lịch sử chỉnh sửa | Done | Transaction, migration, HTTP/service, history dialog và quote/cache; kiểm thử mục tiêu pass |
| Preview production | Done | `npm run test:e2e:built` pass với API thật; phát hiện/sửa thêm voice placeholder offline |
| Multiline và IME | Implemented; device acceptance partial | Unit + Chromium multiline, kích thước mobile, Enter/Shift+Enter pass; IME và keyboard thiết bị thực chưa thử |
| Gửi lại không đè nháp | Done trong phạm vi này | Regression component và E2E send/retry pass |
| Search toàn cục | Done trong phạm vi này | Tận dụng API; archived/unloaded navigation, pagination generation và live retraction; hook + E2E pass |
| Full verification | Done | 485 backend + 470 frontend; version/typecheck/lint/format/audit pass |

Chỉ số nghiệm thu: không mất nháp/gửi trùng trong kịch bản kiểm thử; không lộ dữ
liệu tài khoản khác; không trả nội dung đã thu hồi; thời gian gửi/nhận và tìm lại
được đo theo môi trường cụ thể, không tự đặt số đo thành kết quả thực tế.


### Kết quả nghiệm thu của đợt triển khai

- **Backend:** 485 test / 38 file pass, bao gồm HTTP history, race edit/delete và
  migration chỉ dọn history của tombstone.
- **Frontend:** 470 test / 64 file pass sau chỉnh sửa cuối cùng.
- **Quy ước:** version, typecheck (gồm E2E), lint, format và audit pass, audit 0 hit.
  Lệnh `verify:full` ban đầu dừng ở audit sau khi toàn bộ test đã pass; sau sửa
  bố cục mã và tách helper mention, đã chạy lại toàn bộ kiểm tra tĩnh, frontend
  và audit. Backend không đổi sau lần full suite thành công.
- **Chromium:** 20 kịch bản liên quan pass qua các lượt kiểm tra cuối của từng
  nhóm: draft/account switch, edit/delete/hide, optimistic send/retry, global search,
  chat, reaction/reply và lịch sử cuộn.
- **Built web:** 1 kịch bản ảnh/voice preview → send → reload pass dưới CSP lấy từ
  nginx template, có API/PostgreSQL thật và kiểm tra CSP violation; release workflow
  đã thêm bước này. Đây chưa phải nghiệm thu nginx/TLS của deployment thực tế.
- PostgreSQL nghiệm thu nằm trong container tạm riêng; không sửa/migrate dữ liệu
  development hoặc production. Chưa commit, push hoặc deploy.

### Phần tiếp tục

Danh sách còn lại tại thời điểm kết thúc đợt đầu (đã xử lý tiếp bên dưới):
XP-02/03 còn bàn phím/IME trên thiết bị thực và Safari; XP-07/08 còn lỗi outbox,
request đang bay/discard. Tiếp theo hoàn thiện Saved/bookmark, forward người nhận
ngoài sidebar, rồi các đợt mobile/offline trong experience-polish. Search filters,
Web Push, quản lý phiên và message requests vẫn là backlog, chưa được triển khai.


## Đợt tiếp tục theo yêu cầu làm đến hết ngân sách lượt làm việc

### Đã bổ sung

1. **Gửi và lưu nháp:** cảnh báo outbox không lưu được; retry có khóa đồng thời;
   chặn discard lúc request đang chạy; file/voice/sticker giữ clientId khi retry.
2. **Đổi tài khoản/hội thoại:** chặn outbox ghi trễ và dispatch sau logout;
   localStorage bị chặn vẫn dọn IndexedDB; media composer tách scope;
   sticker cũ hoàn tất không xóa reply của hội thoại mới.
3. **Editor và sticker:** save lỗi giữ chữ; pending không gửi lặp; sticker send
   lỗi giữ tray, delete lỗi giữ tile và có loading/error rõ.
4. **Mention:** nhóm giữ autocomplete; @handle trong DM là text, không còn gây
   lỗi 400 “Mentions are only available in group conversations”.
5. **Đã đọc:** chọn tin theo phần thực sự nằm trong viewport; không tự đọc tin
   mới dưới màn hình; cửa sổ tìm lịch sử tạm dừng cursor để không nhảy qua gap.
6. **Thông báo:** popup và sound cùng resolve metadata còn thiếu, tuân thủ
   mute/restrict; gom request/có giới hạn; đổi quyền hoặc logout trong lúc chờ
   không phát alert theo trạng thái cũ. Group restriction vẫn tách biệt với DM.
7. **Search:** Back to search results giữ query, các trang kết quả đã tải và vị
   trí cuộn; kiểm thử có hơn 20 kết quả trong hội thoại archived.
8. **Sidebar:** tin mới không lôi archived vào active; phản hồi của scope cũ
   không ghi đè scope mới; các lookup trùng được gộp.
9. **Offline/media:** file cache không cho tải URL rỗng; ảnh placeholder không
   cho tải thành bản gốc; vẫn hiển thị metadata và hướng dẫn kết nối.
10. **Panel:** khôi phục divider resize details dùng component có sẵn; kiểm tra
    mouse, keyboard, reset, desktop/mobile. Test resize chờ layout ổn định trước
    thao tác cuộn riêng, không nới assertion về giữ vị trí.

### Kiểm chứng

`npm run verify:full` đã đạt: 485 backend + 494 frontend; version/typecheck/lint/format/audit đạt (0 audit hit).
Sau đó bổ sung pending/error tại hàng cho delete/hide/reaction/pin: toàn bộ 498 frontend test / 70 file đạt;
69 test liên quan, gate tĩnh và 10 kịch bản Chromium thao tác tin/reaction/reply đạt. Bài recovery
chạy riêng đã qua reaction/pin/delete/hide lỗi → thử lại, giữ nguyên nháp tiếp theo. Hai lỗi selector
trong bài browser mới đã sửa (thanh một pin và text trùng giữa pin/message), không nới tiêu chí. Các kịch bản
đã qua bao gồm quota → retry, server commit mất phản hồi → file retry không trùng,
edit lỗi → retry, unread theo viewport, search phân trang/Back, notification ở
archived DM, draft/account switch, voice, vault và resize/scroll. Native popup được
thay bằng recorder trong browser test; đây không phải nghiệm thu popup của hệ
điều hành. Bản build với API thật/CSP lấy từ nginx đã qua lại preview/gửi ảnh/voice.

Gate cuối `npm run verify` đạt với **485 backend + 498 frontend**, typecheck/lint/format và
audit đều đạt; `git diff --check` sạch. Database PostgreSQL nghiệm thu dùng container tạm riêng.

### Tiến độ backlog

Sau đợt recovery: 8/60 mục `done`, 11 mục `partial`, 41 mục `planned`. Đây là trạng thái nghiệm thu từng XP,
không phải phần trăm sẵn sàng production. XP-12 mới đạt các thao tác hiện có; Saved/bookmark
chung chưa được coi là hoàn thành.

### Giới hạn còn giữ

Giới hạn tại thời điểm đợt recovery (Saved/forward đã triển khai tiếp bên dưới):
Chưa hoàn tất toàn bộ 60 XP. Thông báo nhiều tab/Web Push, replay outbox ngoài thread đang mở, quản lý
phiên, IME/Safari/điện thoại thật và đo tải/hiệu năng vẫn còn. Mỗi mục `partial`
trong experience-polish ghi phần tiêu chí chưa được đáp ứng. Không commit, push,
public deploy hoặc áp dụng migration vào database người dùng.


## Đợt tiếp theo — mention, chuyển tiếp và bookmark

- XP-04: mention tại caret, giữ suffix, ArrowUp/Down + Enter và Escape; email/URL không mở sai.
- XP-26: endpoint tìm hội thoại theo membership, gồm archived, phân trang; tên/handle thành viên
  để phân biệt đích. Không tải toàn bộ sidebar để lọc.
- XP-27: preview nội dung và feedback lỗi; retry cùng clientId. Browser đã xác nhận server commit
  rồi mất response, thử lại vẫn một bản. Phản hồi thành công hiện đích + Done; tin gốc thu hồi khi panel mở bị từ chối rõ.
- XP-28: Bookmarked messages tách khỏi self-chat Saved messages; thêm bookmark từ menu tin,
  phân trang toàn tài khoản, mở nguồn, remove không xóa gốc, lỗi giữ mục. Thu hồi/hide/mất membership
  hủy thế hệ trang cũ và tải lại nguồn có thẩm quyền.

Bookmark Chromium đã qua >20 mục, mở archived original, remove lỗi → retry và thu hồi live.
Bổ sung sửa mention/link sau edit trong transaction; đang chạy regression và full verification. Không bổ sung schema/migration mới cho đợt này.
Giới hạn: chưa đồng bộ sự kiện thêm/xóa bookmark giữa nhiều tab; mở lại danh sách sẽ tải bản hiện tại.
Emoji picker và IME/thiết bị thật vẫn cần nghiệm thu riêng, không tick toàn XP-04 chỉ từ mention.


Nghiệm thu mới: Chromium mention/caret/keyboard + edit mention, chuyển tiếp đến archived destination
ngoài trang đầu với mất response sau commit, và bookmark >20 kết quả/remove lỗi/thu hồi đều đạt.
Toàn bộ 508 frontend test đạt. Backend chạy toàn bộ có 488 pass và 1 lỗi fixture nhóm thiếu admin;
đã sửa fixture tạo nhóm qua service, chạy lại 35 test editing đều đạt. Gate tiếp theo đã đạt **489 backend + 512 frontend**, audit 0 hit.

Tiến độ tại cuối đợt mention (trước XP-05): **10 done, 14 partial, 36 planned**. Chưa hoàn tất toàn bộ backlog.

XP-25 bổ sung snippet quanh chỗ khớp và highlight không dấu, giữ chữ gốc và không render HTML.
4 test Unicode/tiếng Việt, nội dung dài, emoji biên và HTML literal đã đạt; Chromium tìm không dấu/Back giữ scroll đạt. Ảnh giao diện đã xem tại `/tmp/chatty-search-highlight.png`.

Tiếp tục XP-05: drop chỉ nhận trong composer và không nhận dưới modal. Test ngoài vùng/modal đã đạt;
Chromium đang kiểm tra hai lần drop chủ ý, xóa một ảnh giữ ảnh còn lại, và emoji thay vùng chọn/caret.

## Hoàn tất XP-05 và gate cuối cùng

`composer-input-boundaries` thất bại một lần do khởi động lạnh của server thử nghiệm (canAcceptDrop/
contains đều đúng khi kiểm tra lại có log); chạy lặp lại 3 lần liên tiếp đều đạt, kể cả hai lần drop
chủ ý giữ hai ảnh riêng, xóa một ảnh giữ ảnh còn lại, và emoji thay đúng vùng chọn tại caret rồi giữ
focus. Không có lỗi thật trong code — đã đánh dấu XP-05 `done`.

Trong lúc rà lại đã phát hiện một lỗi kiểu tại `forward-destinations.test.tsx` (`getByRole` của
Testing Library không có tùy chọn `exact` — đó là API của Playwright, không phải RTL); đã bỏ
`exact: true` và giữ lại `name: "Done"` vì so khớp chuỗi của `getByRole` đã là so khớp chính xác.

Gate cuối `npm run verify` và `npm run verify:full` đều đạt: **489 backend + 513 frontend**, audit
0 hit, typecheck/lint/format sạch. Bộ Playwright toàn phần (71 file, không phải built-web) chạy
69 pass / 2 fail; hai lỗi (`account.spec.ts` đổi mật khẩu, `affordances.spec.ts` tab vào ô tìm kiếm)
đã xác nhận **có sẵn trên `main` sạch** (stash toàn bộ thay đổi rồi chạy lại, vẫn fail giống nhau) —
không liên quan đến bookmark/chuyển tiếp/mention/snippet của đợt này, không phải regression, chưa sửa
trong đợt này. Toàn bộ kịch bản mới (bookmark, forward, mention, global search, composer boundaries)
đều pass trong lần chạy đầy đủ này.


## Tiếp tục ngày 2026-09-17 — thao tác đồng thời và mute hết hạn

- Chuyển tiếp khóa conversation nguồn/đích theo thứ tự ID, kiểm tra lại quyền và trạng thái tin
  sau khi chuẩn bị attachment; hide dùng cùng lock, caption lấy bản mới nhất. Từ chối thì dọn
  file vừa copy. Retry của forward đã commit vẫn trả cùng tin khi nguồn bị thu hồi sau đó.
- Bookmark remove không bị refresh chạy trước khi delete commit làm hiện lại; completion tài khoản
  cũ không làm thay đổi hoặc mở khóa danh sách tài khoản mới.
- Modal giữ Tab/Shift+Tab khi mọi nút đều disabled; forward thành công chuyển focus sang Done.
- Mute hết hạn cập nhật icon, menu và unread title mà không reload; tab ngủ trở lại được tính lại,
  mute Forever không tràn bộ đếm timer. Sidebar/details giữ lỗi sau khi đóng menu, chặn nhấp lặp.
- Chromium đã qua emoji/caret, email/URL không mở mention; deadline edit 8h thật khi editor đang
  mở trả 400 và giữ chữ để copy/paste, không làm đổi nội dung gốc hoặc lịch sử.

### Các lỗi phát hiện thêm và kết quả browser

- **Đổi mật khẩu mất realtime:** tái hiện bằng hai context Chromium, peer gửi tin sau khi đổi mật khẩu
  nhưng người đổi không nhận được, màn hình kẹt Reconnecting. Nguyên nhân là bỏ socket cũ nhưng các
  hook đang mount vẫn giữ listener trên nó. Sửa bằng reconnect cùng instance với token thay thế;
  test gửi/nhận cả hai chiều sau đổi mật khẩu đã đạt.
- **Focus tìm kiếm:** ngoài việc bài test cũ đo resting khi input đã autofocus, CSS conversation chrome
  thực sự ghi đè border focus. Bổ sung `focus-within` ở lớp CSS tương ứng; Chromium Tab/Shift+Tab
  trên light và dark đều đạt, có kiểm tra màu thực từ computed style.
- **Bài account cũ:** login form được mount phía dưới màn chào nhưng còn inert. Bài test giờ bấm Skip
  intro trước khi nhập; luồng đổi mật khẩu → logout → đăng nhập lại đã đạt.
- **Fixture retry mute:** tên test dài hơn giới hạn handle 20 ký tự; đã rút gọn, không đổi validation.

6 regression PostgreSQL forwarding và 37 unit frontend liên quan đạt. **20 kịch bản Chromium khác
nhau liên quan đã đạt qua các lượt**: account (6), affordances (3), conversation actions (3), sidebar (2),
bookmark, composer boundaries, mention, editor expiry, forward và password realtime (mỗi nhóm 1).
Lượt browser cuối chạy 10/10 đạt. Sau đó toàn bộ bộ E2E đã chạy lại một lượt trên Chromium:
**76/76 kịch bản đạt trong 12,7 phút**, không có bài flaky hay phải thử lại.
XP-04, XP-14, XP-27 và XP-42 chuyển sang done theo tiêu chí đã kiểm tra.

`verify:full` trước hai bản sửa bổ sung đạt 495 backend + 530 frontend, audit 0 hit. Lượt full chạy lại
sau hai bản sửa (socket reauth khi đổi mật khẩu, border focus của search) cũng đạt: **495 backend +
530 frontend, 116 test file, audit 0 hit**, typecheck/lint/format sạch. Số test không đổi vì hai bản
sửa mở rộng bài `change-password-form` sẵn có và thêm kịch bản browser `password-realtime`, không
thêm unit mới.
