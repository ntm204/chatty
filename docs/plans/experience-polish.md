# Chatty — kế hoạch trau chuốt trải nghiệm

Ngày lập: **2026-09-05**. Phạm vi được chọn: cải thiện tính năng và giao diện đang có để dùng hằng ngày thuận tiện hơn.

Tài liệu này là backlog triển khai, gồm **60 đầu việc trong 12 đợt**. Đây là công việc tương lai;
việc ghi vào kế hoạch không có nghĩa đã triển khai. Lịch sử phần đã hoàn thành vẫn ở [ROADMAP](../ROADMAP.md).

## Mục tiêu và giới hạn

Người dùng cần soạn dễ, gửi có phản hồi, đọc không mất chỗ, tìm lại nhanh và hiểu được điều gì đang
xảy ra khi mạng hoặc thiết bị gặp vấn đề. Giữ ngôn ngữ thiết kế hiện tại: nội dung là trung tâm,
màu theo token, chữ dễ đọc, khoảng cách có nhịp, chuyển động có mục đích. Copy trong ứng dụng tiếp tục
dùng tiếng Anh theo [quy ước dự án](../../CLAUDE.md); kế hoạch này dùng tiếng Việt để chủ dự án theo dõi.

Phạm vi bao gồm sửa lỗi làm tính năng hiện có hành xử sai, hoàn thiện trạng thái giao diện và đưa các
API tìm kiếm/Saved đã có đến nơi người dùng tìm thấy. Một thay đổi backend nhỏ được phép nằm trong
một đầu việc khi cần thiết để giao diện hoạt động đúng, ví dụ tìm người nhận chuyển tiếp ngoài trang sidebar đã tải.

Các hạng mục sau nằm ngoài chuỗi triển khai này: public launch, domain/mail/backup production,
quản trị hạ tầng, gọi thoại/video, channels/communities, feed/stories, AI, E2EE, MFA/passkey,
Web Push khi đóng ứng dụng và một hệ thống đồng bộ offline mới. File/voice được cải thiện phản hồi và
thử lại trong phiên; lưu bền chúng qua reload sẽ là kế hoạch riêng nếu sau này được chọn.

## Phần chỉnh trực tiếp theo phản hồi giao diện

Phản hồi mới được triển khai thành một lượt riêng tại
[Phase 47](../ROADMAP.md#phase-47--quieter-message-surfaces-and-direct-actions--done):

- Bỏ nền hover trang trí ở các hàng sidebar chưa chọn và nút composer/reaction; bỏ phóng to reaction
  và ảnh trong vault. Thao tác cạnh tin vẫn mở được bằng chuột, focus và cảm ứng.
- Bo góc theo vai trò: tin chữ có đầu cụm mềm và góc nối nhỏ; ảnh/file/voice và composer có độ cong
  riêng, không còn góc nhọn ở cuối tin.
- Đưa Restrict/Unrestrict vào menu hội thoại riêng ở sidebar, bỏ khỏi Conversation details.
- Chọn/dán/thả file thường là gửi ngay, không kèm chữ hoặc reply đang soạn; giữ nháp đó, hiện tiến độ
  và cho Retry/Remove khi lỗi. Ảnh giữ bước preview.
- Nút về tin mới nhất xuất hiện khi cách cuối hơn 120 px hoặc đang xem ngữ cảnh lịch sử; tin mới
  không kéo người đang đọc lên trên về đáy.

Lượt này xử lý **một phần** phạm vi XP-05, XP-09, XP-13, XP-17, XP-45 và XP-53. Các ID đó chưa
được đánh dấu hoàn thành vì vẫn còn tiêu chí rộng hơn bên dưới. XP-01 và XP-11 vẫn là các lỗi ưu tiên
tiếp theo, chưa được sửa trong lượt giao diện này. Trạng thái kiểm chứng của lượt này nằm ở ROADMAP.

Phần voice được trau chuốt tiếp ở Phase 48: player riêng cho hai phía, tua bằng slider, trạng thái
phát/lỗi, waveform khi ghi âm và preview có giữ bản thu khi gửi lỗi. Đây là phần triển khai liên quan
XP-09, XP-36, XP-37 và XP-53; xem ROADMAP để biết kiểm chứng cụ thể, chưa đánh dấu toàn bộ các ID đó
hoàn thành khi chưa nghiệm thu đầy đủ các tiêu chí rộng hơn.

Theo phản hồi tiếp theo, Phase 49 thu player xuống khoảng 240×56 px và thanh ghi âm/preview còn
44 px, giữ các thao tác phát, tua, tốc độ và gửi lại. Bubble chữ co theo dòng đã xuống thay vì giữ
phần nền trống dài; link dài hiển thị đầy đủ, khoảng cách giữa người gửi và thông báo hệ thống gọn hơn.
Đây là phần trau chuốt tiếp XP-13, XP-36, XP-37 và XP-53, không đổi trạng thái của toàn bộ backlog.

Phase 50 tiếp tục XP-17 và XP-53 theo ảnh phản hồi: bỏ mũi tên nổi, thay bằng nút ba chấm 32 px ở
giữa phía trên composer. Chỉ chuyển động khi thực sự có người gõ; có thể hiện tên đang gõ và số tin
mới đến trong lúc đọc phía trên. Không kéo người đọc về cuối; nút này cũng thay thao tác quay về bị
lặp ở đầu ngữ cảnh tìm kiếm. Số tin mới là trạng thái trong phiên, không dùng lại badge unread của
hội thoại và không đếm trang lịch sử vừa tải thành tin mới.

## Cách đọc và cập nhật

- Mỗi ID `XP-01` đến `XP-60` là một đầu việc có thể nghiệm thu riêng. **Tất cả đang `planned`, trừ
  `XP-01` và `XP-11` là `next`. Không có đầu việc nào `done`.**
- Nhãn **Sửa** có căn cứ từ đợt rà soát; mức bằng chứng cụ thể ở bảng bên dưới. **Hoàn thiện** là đề
  xuất trải nghiệm hoặc hành vi cần kiểm tra trước khi chỉnh, không phải tuyên bố rằng hiện tại có lỗi.
- Một đợt là một nhóm trải nghiệm, không phải yêu cầu gom tất cả vào một commit. Triển khai một ID
  hoặc vài ID liên quan chặt chẽ; tuân theo workflow hiện hành trong `CLAUDE.md`.
- Khi bắt đầu, đọc lại source và ghi trạng thái `in progress` vào sổ theo dõi cuối tài liệu. Khi xong,
  ghi kiểm chứng thực tế và cập nhật ROADMAP cùng lượt; không tick cả đợt vì chỉ một phần đã chạy được.
- Nếu một đầu việc cần thêm dịch vụ, mô hình quyền mới hoặc luồng sản phẩm lớn, tách phần đó ra khỏi
  backlog hiện tại. Không mở rộng âm thầm trong lúc trau chuốt.

Một số hành vi xuất hiện ở nhiều bề mặt nhưng chỉ có một đầu việc sở hữu logic: XP-04 phụ trách
caret, XP-38 kiểm tra lại trong picker; XP-09 phụ trách gửi/lỗi sticker, XP-39 hoàn thiện tray;
XP-48 phụ trách vòng đời focus/modal, XP-51 nghiệm thu bàn phím toàn luồng; XP-10 phụ trách quy tắc
trạng thái, XP-55 rà cách biểu diễn thị giác. Các đợt sau tái sử dụng và kiểm tra, không xây lại logic đó.

## Căn cứ của các ưu tiên sửa lỗi

Đợt rà soát ngày 2026-09-05 chạy qua 474 test server, 322 test web và 40 kịch bản Chromium. Đây là
mốc tham chiếu của lần rà soát, không phải tỷ lệ coverage hoặc kết quả kiểm chứng cho 60 đầu việc mới.

| Căn cứ | Mức bằng chứng | Đầu việc xử lý |
| --- | --- | --- |
| Nháp chỉ có khóa conversation ID, cleanup đăng xuất không xóa nháp đó | Đã tái hiện với hook, DOM/bộ nhớ giả lập và hàm cleanup thật; chưa phải luồng browser đăng nhập hai tài khoản | XP-01 |
| Sau gửi → sửa → thu hồi, người nhận vẫn đọc được bản cũ qua edit history | Đã tái hiện với service thật và PostgreSQL test; chưa qua HTTP | XP-11 |
| CSP hiện tại chặn blob ảnh/audio dùng trong preview | Đã tái hiện bằng Chromium trên HTTP server tạm dùng đúng policy; chưa kiểm thử toàn bộ web build với API | XP-31 |
| Restrict/unread/notification không cùng áp dụng một chính sách | Đã đọc các đường xử lý frontend/backend; cần tái hiện cả DM và nhóm trước khi sửa | XP-18, XP-19 |
| Composer một dòng; thiếu bảo vệ IME ở một số đường Enter | Đã đọc source; kiểm tra lại composer và editor khi thực hiện | XP-02, XP-03 |
| Chuyển tiếp chỉ dùng các hội thoại sidebar đã tải; search/Saved toàn tài khoản chưa có điểm vào chung | Đã đối chiếu component, API client và service | XP-23, XP-26, XP-28 |
| Read marker theo tin mới nhất đã tải; một số thao tác không trình bày lỗi mạng | Đã đọc source; bổ sung tình huống thực tế trước khi thay đổi | XP-09, XP-12, XP-16 |

Các điểm vào: [nháp](../../apps/web/src/features/chat/hooks/use-message-draft.ts),
[cleanup tài khoản](../../apps/web/src/hooks/use-auth.ts),
[message service](../../apps/server/src/modules/messages/messages.service.ts),
[CSP](../../apps/web/nginx.conf.template),
[notification](../../apps/web/src/features/chat/hooks/use-message-notifications.ts),
[unread server](../../apps/server/src/modules/conversations/conversations.service.ts).

## Thứ tự triển khai

| Đợt | Phạm vi | ID | Phụ thuộc và cách triển khai |
| --- | --- | --- | --- |
| 1 | Soạn tin và cách nhập | XP-01–05 | Bắt đầu XP-01; XP-11 có thể được xử lý độc lập ngay trong đợt đầu |
| 2 | Nháp, trạng thái gửi và phục hồi lỗi | XP-06–10 | Dựa trên cách nhập và phân tách tài khoản ở đợt 1 |
| 3 | Thao tác trên tin nhắn | XP-11–15 | XP-11 ưu tiên ngay; các mục còn lại dùng quy tắc phản hồi ở đợt 2 |
| 4 | Đọc, cuộn và thông báo | XP-16–20 | Chốt ma trận quyền riêng tư trước khi sửa unread/notification |
| 5 | Tìm kiếm | XP-21–25 | Có thể làm sau đợt 2, song song đợt 4 nếu không sửa cùng file |
| 6 | Chuyển tiếp, Saved và kho nội dung | XP-26–30 | Tận dụng cách tìm kiếm/điều hướng của đợt 5 |
| 7 | Ảnh và file | XP-31–35 | XP-31 có thể làm sớm độc lập; phản hồi lỗi theo đợt 2 |
| 8 | Voice, emoji và sticker | XP-36–40 | Dùng focus/caret đợt 1 và media/error states đợt 7 |
| 9 | Sidebar, nhóm và cài đặt | XP-41–45 | Dùng chính sách unread/notification đã thống nhất |
| 10 | Điện thoại, panel và điều hướng | XP-46–50 | Kiểm tra chéo các luồng đã hoàn thiện; yêu cầu mobile áp dụng từ mỗi đợt trước |
| 11 | Bàn phím, khả năng tiếp cận và chi tiết thị giác | XP-51–55 | Củng cố thành phần chung; focus/token/copy đúng phải được giữ ngay từ đầu |
| 12 | Offline hiện có, hiệu năng và nghiệm thu tổng thể | XP-56–60 | Tích hợp các luồng; hồi quy hiệu năng vẫn phải kiểm tra trong từng đợt |

Thứ tự này ưu tiên thao tác dùng liên tục. Không cần chờ hết một đợt để sửa một lỗi độc lập ở đợt
sau; các phụ thuộc là hành vi và file thực tế, không phải nghi thức đánh số.

## Đợt 1 — Soạn tin và cách nhập

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-01 | **Sửa — tách nháp theo tài khoản** | Hai tài khoản cùng trình duyệt và cùng hội thoại không đọc được nháp của nhau. Cleanup bao gồm thứ tự unmount/ghi nháp trễ, logout, xóa tài khoản và đổi tài khoản. Nháp khóa cũ không rõ chủ phải được bỏ, không tự gán cho người đang đăng nhập. |
| XP-02 | **Hoàn thiện — composer nhiều dòng, tự tăng chiều cao** | Xuống dòng và dán đoạn dài giữ nguyên nội dung; chỉ phần nhập cuộn khi đạt trần chiều cao, không đẩy mất lịch sử hay nút gửi. Thử cùng reply, ảnh đính kèm, tên dài và bàn phím điện thoại. |
| XP-03 | **Sửa — thống nhất Enter, Shift+Enter và IME** | Mặc định Enter gửi, Shift+Enter xuống dòng; nút gửi luôn có đường truy cập rõ. Không đổi quy tắc chỉ theo viewport; kiểm tra bàn phím ảo và bàn phím vật lý, cả khi gắn vào điện thoại/tablet. Composer/editor không gửi/lưu khi composition hoặc Enter đang chọn mention; giữ phím không gửi lặp. |
| XP-04 | **Hoàn thiện — chèn emoji/mention tại con trỏ** | Emoji vào đúng caret hoặc thay vùng chọn; chọn mention không phá chữ phía sau, mở picker không mất vị trí nhập. Mũi tên/Enter/Escape làm việc được; dấu @ trong email hoặc đoạn URL không mở gợi ý sai. |
| XP-05 | **Hoàn thiện — bố cục composer khi có nhiều nội dung** | Reply preview, ảnh/file và các nút có thứ bậc rõ. Bỏ reply giữ chữ; bỏ một ảnh giữ các ảnh còn lại. Paste/drop chỉ vào bề mặt đang nhận input; một event không bị xử lý hai lần bởi listener global và composer. Hai lần dán có chủ ý vẫn được giữ, chọn lại cùng file được. |

Điểm vào: `message-input.tsx`, `composer-*.tsx`, `use-message-draft.ts`, `use-message-editing.ts` và
`message-editor.tsx` trong feature chat. Kiểm chứng trọng tâm: composer test, kiểm tra IME thủ công,
luồng gửi bằng phím và chuyển tài khoản trên browser với database test riêng.

## Đợt 2 — Nháp, trạng thái gửi và phục hồi lỗi

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-06 | **Hoàn thiện — khôi phục nháp có ngữ cảnh** | Chuyển A → B → A và reload khôi phục đúng chữ/reply của A; gửi thành công xóa đúng nháp. Tin reply đã bị xóa hoặc không còn truy cập được có trạng thái rõ; phản hồi mạng trễ của hội thoại cũ không đè nội dung mới. |
| XP-07 | **Sửa — thông báo khi không thể lưu nháp bền** | Khi IndexedDB/localStorage bị từ chối hoặc hết quota, nội dung đang nhập vẫn còn trong phiên và có giải thích ngắn rằng reload có thể mất dữ liệu. Không báo đã lưu khi ghi thất bại; thông báo không lặp sau mỗi phím. |
| XP-08 | **Hoàn thiện — tin chờ và gửi lại chữ/ảnh** | Phân biệt đang chờ mạng, đang gửi và thất bại. Gửi A rồi gõ B: A lỗi vẫn giữ B trong composer, A ở hàng tin có thể retry. Retry giữ cùng client ID; nhấn liên tiếp/reconnect hoặc mất response sau server commit không tạo hai tin. Discard xử lý rõ trường hợp request đang bay. |
| XP-09 | **Sửa — phản hồi gửi file/voice/sticker trong phiên** | File thường chọn là gửi ngay, không ghép chữ/reply đang soạn và không làm mất nháp. Lỗi gửi hiện ngay ở nơi thao tác; người dùng vẫn giữ được nội dung/nguồn gửi cần thiết để thử lại trong phiên. Không đóng tray rồi thất bại im lặng; không hiển thị thành công sớm. Reload/offline dài không được hứa giữ bền các loại chưa hỗ trợ. |
| XP-10 | **Hoàn thiện — một quy tắc trạng thái cho thao tác bất đồng bộ** | Pending, success, error và retry có cách diễn đạt nhất quán; chỉ khóa thao tác đang chạy, không vô hiệu hóa cả màn hình. Hết phiên có một cách xử lý tập trung; lỗi cụ thể không đồng thời xuất hiện thành nhiều toast/banner. |

Điểm vào: [hook gửi tin](../../apps/web/src/features/chat/hooks/use-conversation-messages.ts),
[local store](../../apps/web/src/lib/local-chat-store.ts), `message-delivery-status.tsx`, API client.
Việc thử lại các loại gửi trực tiếp phải mang client ID ổn định nếu có thể bị nhận ở server trước khi
mất response; không chỉ thêm nút gọi lại request với ID mới.

## Đợt 3 — Thao tác trên tin nhắn

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-11 | **Sửa — thu hồi bao gồm lịch sử chỉnh sửa** | Sau send → edit → delete, thành viên khác gọi endpoint history không đọc được nội dung cũ. Dọn/redact history cùng transaction, xử lý lịch sử còn sót của tin đã thu hồi trước bản sửa và chặn đọc tombstone. Quote, pins, Saved, search và cache đã nhận cập nhật không tiếp tục hiển thị bản cũ; xóa riêng cho tôi giữ ngữ nghĩa riêng. |
| XP-12 | **Sửa — lỗi/pending cho edit, delete, reaction, pin và save** | Mạng lỗi không làm nút trông như đã thành công; có thông báo và cách thử lại tại đúng tin. Nhấp nhanh không tạo chuỗi toggle ngoài ý muốn. Chỉ retry thao tác có ngữ nghĩa an toàn; reaction dạng toggle không được retry mù nếu chưa biết server đã áp dụng chưa. |
| XP-13 | **Hoàn thiện — menu thao tác dễ tìm trên chuột và cảm ứng** | Cùng một bộ hành động có đường mở rõ trên desktop/mobile; đọc/chọn/copy văn bản không vô tình mở menu. Nhóm hành động thường dùng và phá hủy có thứ bậc; menu nằm trong viewport, không chỉ dựa vào hover. |
| XP-14 | **Hoàn thiện — chỉnh sửa không làm mất ngữ nghĩa nội dung** | Editor hỗ trợ nhiều dòng/IME, giữ giá trị đang sửa khi save lỗi. Chốt hành vi mention khi sửa, đồng bộ mention/link đã lưu với nội dung hiển thị. Cửa sổ 8 giờ hết khi editor đang mở phải có phản hồi rõ và giữ chữ để copy. |
| XP-15 | **Hoàn thiện — reply và nhảy về ngữ cảnh** | Nhảy tới tin gốc ngoài trang đã tải vẫn đúng và có đánh dấu tạm không chỉ bằng chuyển động. Tin bị thu hồi/ẩn hoặc mất quyền truy cập có thông báo phù hợp; một đường quay về vị trí trước khi nhảy giữ được ngữ cảnh đang đọc. |

Điểm vào: message service/controller/routes, `use-message-actions.ts`, `message-actions-menu.tsx`,
`message-reply-quote.tsx`, `use-reply-target.ts`. XP-11 cần regression ở HTTP + PostgreSQL,
`verify:full`, và luồng hai người dùng. Không hứa xóa được screenshot, bản copy, tin chuyển tiếp độc
lập hoặc cache trên một thiết bị còn offline; cache nội bộ phải xử lý thu hồi ở lần đồng bộ có thẩm quyền kế tiếp.

## Đợt 4 — Đọc, cuộn và thông báo

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-16 | **Sửa — đã đọc theo phần người dùng thực sự nhìn thấy** | Tin mới tới khi đang xem lịch sử cũ không tự thành đã đọc. Chỉ tiến marker theo nội dung nhìn thấy trong tab đang active, không lùi marker. Search/context jumps có quy tắc rõ vì marker hiện tại biểu diễn một mốc, không phải tập tin riêng lẻ. |
| XP-17 | **Hoàn thiện — giữ vị trí cuộn** | Tải lịch sử, ảnh decode, reaction, sửa tin hoặc composer tăng chiều cao không giật vị trí đang đọc. Khi đang ở cuối thì theo tin mới; khi cách cuối hơn 120 px thì hiện nút về tin mới, có số đếm khi có unread. Ngữ cảnh lịch sử luôn có đường về luồng mới nhất. Chuyển thread và Back khôi phục vị trí hợp lý. |
| XP-18 | **Sửa — ma trận unread/mute/restrict/block thống nhất** | Chốt kỳ vọng cho DM và nhóm theo bảng dưới; API và socket cho cùng badge trước/sau refresh. Kiểm tra cùng một người ở cả DM lẫn nhóm, thay đổi quyền trên thiết bị thứ hai, và mute hết hạn khi app đang mở. |
| XP-19 | **Sửa — notification không phụ thuộc sidebar đã tải** | Tin từ một hội thoại nằm ngoài trang sidebar vẫn áp dụng đúng mute/restrict. Khi thiếu metadata, chưa phát notification có thể trái chính sách; tải có giới hạn hoặc bổ sung sự kiện riêng cho người nhận. Không đưa trường riêng tư của một người vào broadcast chung. |
| XP-20 | **Hoàn thiện — notification trong các tab đang mở** | Bấm thông báo mở đúng hội thoại và đưa app lên trước; có tùy chọn ẩn nội dung. Nhiều tab của cùng tài khoản hạn chế thông báo trùng, logout dọn notification đã tạo khi API trình duyệt cho phép; quyền bị từ chối/không hỗ trợ có hướng dẫn ngắn. |

Điểm vào: `use-mark-read.ts`, `use-message-scroll.ts`, `use-conversation-list.ts`,
`use-message-notifications.ts`, `use-notification-setting.ts`, conversation/restriction services.

Ma trận mục tiêu cho XP-18 (cần xác nhận lại với contract/source trước khi code):

| Trạng thái | Nhận nội dung | Unread | Thông báo |
| --- | --- | --- | --- |
| DM/nhóm bình thường | Theo membership | Tiến theo mốc đọc | Theo quyền và tùy chọn browser |
| Mute hội thoại | Vẫn nhận | Vẫn tính badge hội thoại; tổng title theo chính sách mute hiện tại | Tắt, giữ ngoại lệ mention hiện có nếu không có hạn chế mạnh hơn |
| Restrict người trong DM | Vẫn nhận, thao tác restrict kín đáo | Không tạo badge thu hút chú ý cho DM bị restrict | Không báo; mention không vượt qua restrict |
| Cùng người bị restrict/block trong nhóm | Theo membership nhóm | Không tự loại mọi tin của người đó chỉ vì quan hệ riêng trong DM | Theo mute và mention của nhóm |
| Block trong DM | Không cho các tương tác bị cấm đi qua server | Đọc lịch sử vẫn có thể xóa badge của chính mình | Không phát thông báo tương tác mới bị chính sách cấm |

Nếu tài liệu và code mâu thuẫn, ghi rõ quyết định nhỏ này trong kết quả XP-18 và cập nhật copy liên
quan. Không diễn giải restrict thành group ban hoặc thay đổi chính sách âm thầm.

## Đợt 5 — Tìm kiếm

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-21 | **Sửa — kết quả tìm kiếm không bị phản hồi cũ ghi đè** | Nhập A rồi B trong khi A/load-more còn chạy chỉ hiển thị B. Đóng search, đổi hội thoại và lỗi tải thêm không append dữ liệu sai; có retry và trạng thái loading/empty/error riêng. |
| XP-22 | **Hoàn thiện — tìm trong hội thoại thuận tay** | Có cách mở dễ thấy và phím tắt phù hợp; focus đúng ô, nút xóa từ khóa rõ, query được giữ khi xem kết quả. Enter/arrow/Escape không xung đột với composer. |
| XP-23 | **Hoàn thiện — điểm vào tìm tin toàn tài khoản** | Dùng endpoint search sẵn có khi không biết nội dung nằm ở thread nào. Kết quả có người/nhóm và ngữ cảnh; chọn một kết quả mở đúng tin, Back trả về query và vị trí danh sách. Chỉ trả dữ liệu còn quyền xem. |
| XP-24 | **Hoàn thiện — tìm và chọn người dễ phân biệt** | Tên trùng được phân biệt bằng handle/avatar; loading, không tìm thấy, đã chọn và lỗi đều rõ. Gõ liên tiếp chỉ giữ kết quả mới nhất. Không mở rộng dữ liệu email công khai; kiểm tra cách tìm tiếng Việt theo hợp đồng API hiện tại. |
| XP-25 | **Hoàn thiện — trình bày kết quả dài và phân trang** | Snippet dễ đọc, tên nhóm/file dài không đè thời gian, từ khóa được đánh dấu như text an toàn. Không lặp/bỏ hàng ở trang sau; tin bị sửa/thu hồi giữa lúc tìm được cập nhật hoặc báo không còn khả dụng. |

Điểm vào: `use-message-search.ts`, `conversation-message-search.tsx`, `new-conversation-panel.tsx`,
[search service](../../apps/server/src/modules/search/search.service.ts). Bộ lọc tác giả/ngày/media,
tìm nội dung file và tìm kiếm ngữ nghĩa là mở rộng riêng, không được kéo vào XP-23.

## Đợt 6 — Chuyển tiếp, Saved và kho nội dung

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-26 | **Sửa — chọn người nhận chuyển tiếp ngoài sidebar đã tải** | Tìm và phân trang được các hội thoại người dùng còn tham gia, kể cả chưa mở hoặc đã archive. Chọn đúng người khi trùng tên; không tải tất cả hội thoại về rồi lọc. Backend bổ sung filter/cursor nhỏ nếu API hiện tại chưa đủ. |
| XP-27 | **Hoàn thiện — xác nhận và phản hồi chuyển tiếp** | Thấy nội dung sắp gửi và nơi nhận; pending/error ở đúng đích, thành công có phản hồi ngắn. Nếu tin gốc bị xóa/quyền thay đổi trước khi gửi thì báo rõ; không tự điều hướng làm mất chỗ đang đọc. Giữ một đích mỗi lần trong phạm vi này. |
| XP-28 | **Hoàn thiện — Saved chung toàn tài khoản** | Có điểm vào chung dùng personal vault API sẵn có; mỗi mục chỉ rõ hội thoại gốc, phân trang và mở đúng tin. Không lộ mục của hội thoại đã mất quyền; loại bỏ media đang lỗi khỏi thao tác tải mù. |
| XP-29 | **Hoàn thiện — save/unsave đồng nhất giữa các bề mặt** | Thread, viewer, kho từng hội thoại và Saved chung phản ánh cùng trạng thái. Unsave lỗi phải giữ/khôi phục mục với phản hồi rõ; không làm nhảy cả danh sách và không tác động bookmark của người khác. |
| XP-30 | **Hoàn thiện — đi và về trong kho nội dung** | Quay lại category giữ vị trí; số lượng, empty state và các hàng thống nhất sau xóa/thu hồi. Media/file/voice/link hiển thị metadata dễ hiểu; mở item rồi đóng quay về đúng category và vị trí. |

Điểm vào: `forward-message-panel.tsx`, `use-conversation-vault.ts`, `conversation-vault-panel.tsx`,
[vault routes](../../apps/server/src/modules/vault/vault.routes.ts), conversation service và shared DTOs.
Giữ kiểm tra membership ở service; UI picker không thay thế quyền gửi tại thời điểm request.

## Đợt 7 — Ảnh và file

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-31 | **Sửa — preview ảnh/audio chạy dưới CSP của web build** | Ảnh chọn, ảnh pending và voice preview chạy khi dùng đúng headers của build; không nới script policy tùy tiện. Có browser regression phát hiện CSP violation, thử với API thật ở topology local cách ly. |
| XP-32 | **Hoàn thiện — chọn media và thông báo giới hạn** | Chỉ rõ file nào sai loại/quá dung lượng/quá số lượng; giữ các lựa chọn hợp lệ và caption khi một mục lỗi. Người dùng biết vì sao ảnh/file/voice không trộn trong một tin; không im lặng bỏ nội dung paste. |
| XP-33 | **Hoàn thiện — upload có tiến trình và phục hồi hợp lý** | Phân biệt xử lý ảnh, truyền bytes và chờ xác nhận; không dùng phần trăm giả cho bước không đo được. Mạng đứt vẫn giữ preview cần cho retry trong phạm vi được hỗ trợ; không hứa hủy request đồng nghĩa server chưa nhận. |
| XP-34 | **Hoàn thiện — viewer trên ảnh khó và màn hình hẹp** | Ảnh rất dọc/ngang, caption dài và album nhiều ảnh không che nút đóng. Zoom/rotate/chuyển ảnh có trạng thái dự đoán được; phím chỉ tác động viewer đang trên cùng, đóng viewer trả focus về ảnh mở nó. |
| XP-35 | **Hoàn thiện — tải file và media không còn khả dụng** | Tên dài, Unicode, size/type rõ ràng; tải lỗi/hết hạn URL có retry hợp lý qua dữ liệu được cấp quyền mới. Placeholder offline không cho tải file rỗng hay mở URL giả; media đã thu hồi không được làm sống lại bằng retry. |

Điểm vào: `use-composer-attachments.ts`, `optimize-image-upload.ts`, `attachment-lightbox*.tsx`,
`message-file-card.tsx`, `download-attachment.ts`, `local-chat-store.ts`, attachment routes và CSP.
Giữ giới hạn upload và chính sách phục vụ file hiện tại; đổi giới hạn là quyết định khác phải cập nhật cả server, UI và tài liệu.

## Đợt 8 — Voice, emoji và sticker

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-36 | **Hoàn thiện — vòng đời ghi âm rõ và an toàn với nội dung đang soạn** | Permission denied, không có mic, mất thiết bị, chạm giới hạn thời gian và lỗi recorder có phản hồi riêng. Stop/cancel/unmount nhả mic và tài nguyên; lỗi gửi giữ bản nghe lại trong phiên. Không làm mất nháp text khi đóng recorder. |
| XP-37 | **Hoàn thiện — phát voice bằng chuột, tay và bàn phím** | Tua có slider semantics và phím điều khiển; thời lượng/tốc độ dễ hiểu, không chỉ đọc được bằng mắt. Mở voice thứ hai có quy tắc nhất quán; đang tải/lỗi/offline không trông như đang phát. |
| XP-38 | **Hoàn thiện — emoji picker tìm nhanh và trở về nhập tiếp** | Tìm tiếng Việt có/không dấu theo dữ liệu hiện có; có empty state. Chọn emoji ở đúng caret, Escape đóng đúng picker; recent không làm mất focus hoặc thay vị trí mục ngay trước cú bấm. |
| XP-39 | **Hoàn thiện — sticker tray có loading, empty và error states** | Thêm/xóa/gửi có phản hồi, xử lý giới hạn rõ; nút xóa dễ chạm và không gửi sticker khi bấm nhầm vùng lân cận. Gửi thất bại vẫn biết sticker nào cần thử lại; xóa khỏi tray không xóa sticker đã gửi. |
| XP-40 | **Hoàn thiện — reaction và bảng người phản ứng** | Touch có cách mở ngang với chuột; emoji dài/tên dài/số lượng nhiều không tràn. Khi nhận sự kiện đồng thời, lựa chọn cá nhân và tổng số hội tụ đúng; không ghi đè một thay đổi mới bằng response cũ. |

Điểm vào: recorder/player hooks, `voice-recorder.tsx`, `voice-player.tsx`, `emoji-picker.tsx`,
`sticker-tray.tsx`, reaction components. Không thêm kho sticker công cộng, loại media mới hoặc nhận diện giọng nói.

## Đợt 9 — Sidebar, nhóm và cài đặt

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-41 | **Hoàn thiện — danh sách hội thoại dễ quét** | Tên dài, preview file/voice/sticker/thu hồi, timestamp và badge không tranh chỗ. Dễ phân biệt active, unread, pinned, muted; không dùng màu làm dấu hiệu duy nhất. Sự kiện typing không làm reorder hội thoại. |
| XP-42 | **Hoàn thiện — archive, pin và mute có phản hồi tại chỗ** | Thao tác có pending/error và giải thích giới hạn 5 pin. Có đường quay lại Archived rõ; mute hết hạn cập nhật không cần reload. Undo chỉ dùng khi ngữ nghĩa an toàn và server xác nhận, không giả thành công. |
| XP-43 | **Hoàn thiện — danh sách và hành động quản lý nhóm** | Role, người đang thao tác và đối tượng hành động dễ phân biệt; tên/handle dài vẫn đọc được. Khi role/membership thay đổi giữa lúc panel mở, nút và kết quả API phản ánh quyền mới; lỗi mời/xóa không đóng panel mất lựa chọn. |
| XP-44 | **Hoàn thiện — cài đặt cá nhân và form tài khoản** | Nhãn, validation, pending/success/error nhất quán; lỗi nằm cạnh trường tương ứng, không xóa giá trị vừa nhập. Avatar lỗi giữ bản cũ; đóng settings không mất chỗ chat. Thử password manager/autofill với form đăng nhập và đổi mật khẩu hiện có. |
| XP-45 | **Hoàn thiện — copy giải thích các lựa chọn riêng tư** | Block/restrict/mute, last seen và read receipts diễn đạt khác biệt bằng ngôn ngữ người dùng; nói rõ phạm vi nhóm chung. Confirm xóa/rời/chuyển chủ nêu đúng đối tượng và hậu quả, focus mặc định không thúc đẩy hành động phá hủy. |

Điểm vào: sidebar/conversation actions, group panels, feature profile, auth forms. Không thêm role,
ban/report, lời mời chờ duyệt hoặc hệ thống thiết bị mới trong đợt này.

## Đợt 10 — Điện thoại, panel và điều hướng

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-46 | **Hoàn thiện — bố cục với bàn phím điện thoại và safe area** | Composer/nút gửi không bị keyboard hoặc vùng home indicator che; mở/đóng bàn phím không gây nhảy vị trí đọc. Thử chiều ngang, màn hình thấp, text zoom và thanh địa chỉ trình duyệt co giãn. |
| XP-47 | **Hoàn thiện — Back và phục hồi vị trí** | List → thread → details → item rồi Back trả đúng lớp và vị trí; browser Back không mắc vòng lặp. Deep link hoặc refresh khi không có lịch sử vẫn có đường về hợp lý. |
| XP-48 | **Hoàn thiện — vòng đời dialog và panel dùng chung** | Tab chỉ đi trong modal đang mở; Escape/backdrop đóng lớp trên cùng theo loại bề mặt. Focus trả về trigger còn tồn tại hoặc điểm thay thế hợp lý; thao tác đóng không vô tình gửi/hủy nháp. |
| XP-49 | **Hoàn thiện — vùng chạm và thao tác một tay** | Các nút nhỏ như bỏ ảnh, xóa sticker, reaction và menu có vùng tương tác đủ rộng, không chồng lên nhau. Kiểm tra thực tế bằng tay và text selection; bố cục giữ mật độ đọc thay vì phóng to mọi icon. |
| XP-50 | **Hoàn thiện — chuyển màn hình không có khoảng trống khó hiểu** | Có loading/error/empty phù hợp khi mở thread/panel; skeleton chỉ dùng nơi có ích và giữ kích thước gần nội dung. Request cũ không vẽ dữ liệu vào thread mới; quay lại nhanh không lóe màn hình sai tài khoản. |

Điểm vào: chat page/panes, settings modal, [dialog hook](../../apps/web/src/hooks/use-dialog.ts),
viewer và forward panel. Kiểm tra hai browser engine và thiết bị thật khi có; emulation không được ghi là đã thử iPhone/Android thật.

## Đợt 11 — Bàn phím, khả năng tiếp cận và chi tiết thị giác

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-51 | **Hoàn thiện — đi trọn luồng bằng bàn phím** | Từ sidebar tới gửi/reply/reaction/search/forward/voice seek không mắc kẹt focus. Phím tắt không chiếm phím khi đang nhập, composition hoặc modal khác đang dùng; có cách xem trợ giúp dễ tìm. |
| XP-52 | **Hoàn thiện — trạng thái đọc được bằng công nghệ hỗ trợ** | Nút có tên đúng đối tượng; combobox/slider/dialog có role và state phù hợp. Thông báo tin mới hoặc lỗi không đọc lại toàn bộ lịch sử; không cướp focus để thông báo một sự kiện nền. |
| XP-53 | **Hoàn thiện — typography, khoảng cách và nội dung dài** | Kiểm tra font thực đang dùng, dấu tiếng Việt, URL dài, emoji và metadata. Dùng token/component chung, thống nhất baseline/alignment; giữ bo góc riêng cho tin chữ, media và composer, hover không thêm nền trang trí hoặc phóng to. Không thay bộ nhận diện hay font theo các mô tả cũ chưa đối chiếu source. |
| XP-54 | **Hoàn thiện — light/dark/system và reduced motion** | Text, icon, focus, selected, disabled và error đều phân biệt được trên hai theme. Chuyển System khi hệ điều hành đổi không chớp sai theme; reduced motion vẫn cho biết trạng thái thay đổi. |
| XP-55 | **Hoàn thiện — bộ trạng thái thị giác chuẩn** | Rà loading, empty, pending, success, failure, offline, disabled và permission denied trên các bề mặt chính. Copy ngắn, chỉ rõ thao tác tiếp theo; icon/spacing/radius theo hệ hiện có, không thêm các kiểu nút riêng từng panel. |

Điểm vào: shared components/hooks, design tokens, từng feature component. Ghi lại trước/sau bằng
ảnh cùng dữ liệu và viewport. Chỉ tạo visual regression cho bố cục dễ tái phát lỗi; screenshot đơn lẻ không tự chứng minh UX hoặc accessibility đúng.

## Đợt 12 — Offline hiện có, hiệu năng và nghiệm thu tổng thể

| ID | Công việc | Tiêu chí nghiệm thu |
| --- | --- | --- |
| XP-56 | **Hoàn thiện — khả năng đọc offline được diễn đạt đúng** | Phân biệt bản lưu trên máy với lỗi tải; nội dung chưa có trong cache cho biết cần kết nối. Media placeholder inert; search/server-only action không giả thành kết quả rỗng. Khi online lại lấy quyền và URL mới trước khi cho thao tác phụ thuộc chúng. |
| XP-57 | **Hoàn thiện — phát lại hàng đợi chữ/ảnh khi app đang mở** | Tin đã xếp hàng không bị quên vì người dùng rời thread; replay có giới hạn, đúng tài khoản và sau khi xác nhận phiên/quyền. Tái sử dụng IndexedDB/client ID hiện có; hai tab không tạo tin trùng, logout không replay tài khoản cũ. Không thêm màn quản lý hàng đợi, đồng bộ nền, đồng bộ nháp liên thiết bị hoặc outbox file/voice. |
| XP-58 | **Hoàn thiện — vòng đời app shell và dữ liệu cục bộ** | Web build đã mở online có thể mở lại phần được hỗ trợ khi offline; cập nhật app không ghép HTML cũ với assets mới thiếu cache. Nếu cần reload bản mới, bảo toàn nháp được hỗ trợ và hỏi tại UI trước khi ngắt việc đang làm. Dữ liệu tài khoản cũ không khôi phục sau cleanup. |
| XP-59 | **Hoàn thiện — đo và tối ưu các điểm tương tác chậm** | Dùng dataset cố định, máy/browser cụ thể để đo gõ, mở panel, search, scroll và memory sau đóng media. Sửa phần có số đo; kiểm tra request thừa, render thừa, object URL/listener bị giữ. Giữ scroll/caret đúng, chỉ cân nhắc virtualization nếu bằng chứng cần nó. |
| XP-60 | **Hoàn thiện — chạy nghiệm thu xuyên suốt và chốt tài liệu** | Hoàn thành ma trận dưới đây, ghi rõ pass/fail/chưa thử theo môi trường. Cập nhật trạng thái từng ID, giới hạn còn lại và tài liệu đang mô tả hành vi. Mục chưa kiểm chứng không được ghi done chỉ vì typecheck hoặc screenshot đẹp. |

Điểm vào: `local-chat-store.ts`, `local-outbox.ts`, `use-conversation-messages.ts`, `sw.js`, service
worker registration, message rows/list và e2e. Không đặt một mục tiêu mili giây tùy ý trước khi có baseline;
so sánh trước/sau trên cùng thiết bị, cùng dữ liệu, cùng thao tác.

## Các quy tắc nghiệm thu áp dụng từ đầu

1. **Giữ nội dung và vị trí của người dùng.** Chữ, lựa chọn, caret, scroll và focus chỉ đổi khi có
   lý do gắn với thao tác. Tài nguyên local cần giải phóng phải có vòng đời rõ.
2. **Phản hồi đúng sự thật.** Phân biệt chưa gửi, đang gửi, server đã xác nhận và đã đọc. Không báo
   thành công khi chỉ đóng dialog; không hứa lưu offline cho loại nội dung chưa hỗ trợ.
3. **Mỗi thao tác có trạng thái kết thúc.** Thành công, lỗi có cách phục hồi, hoặc bị hủy có giải
   thích. Không retry mù với toggle/non-idempotent; không lộ lỗi kỹ thuật thô trong copy ứng dụng.
4. **Riêng tư theo người nhận.** Badge, mute, restrict, Saved và draft không được lẫn tài khoản hoặc
   đi qua room chung bằng dữ liệu cá nhân hóa. Cache là bản sao có giới hạn, server vẫn quyết định quyền.
5. **Dùng thuận tay ngay trong từng đợt.** Chuột, cảm ứng, bàn phím, hai theme, text dài và trạng thái
   lỗi phải được xem xét khi làm component; các đợt 10–11 là rà soát tổng thể, không phải chỗ dồn lỗi.
6. **Đổi ít nhưng giải quyết trọn luồng.** Tận dụng endpoint/type/component hiện có. Khi cần sửa API,
   cập nhật DTO, validation, membership và test cùng lúc; không thêm abstraction chỉ để làm đẹp code.

## Ma trận kiểm chứng

| Tình huống | Những đầu việc phải được kiểm tra cùng nhau |
| --- | --- |
| Soạn đoạn dài tiếng Việt, IME, reply và ảnh; gửi bằng phím và nút | XP-02–05, XP-08, XP-14 |
| Ghi nháp A, đổi thread, logout, đăng nhập B cùng thiết bị, quay lại A | XP-01, XP-06–07, XP-57–58 |
| Request đã đến server nhưng response bị mất; retry, reload, hai tab | XP-08–10, XP-12, XP-27, XP-57 |
| Hai người: gửi → edit → thu hồi; kiểm tra HTTP history, quote, Saved, search | XP-11, XP-15, XP-25, XP-28–30 |
| Người nhận đang xem tin cũ; người kia gửi ảnh, reaction hoặc sửa tin | XP-16–17, XP-33–34, XP-59 |
| Mute/restrict cùng người ở DM và nhóm, hội thoại ngoài trang sidebar | XP-18–20, XP-41–42 |
| Search A → B thật nhanh, tải thêm, mở tin, Back; forward tới thread chưa tải | XP-21–27, XP-47 |
| Permission mic/notification bị từ chối; URL hết hạn; quota local đầy | XP-07, XP-20, XP-35–37, XP-56 |
| Web build với CSP thật: blob ảnh/audio, offline reload và quay lại online | XP-31, XP-36, XP-56–58 |
| Mobile keyboard, xoay màn hình, theme, text zoom, long names/URLs | XP-34, XP-41, XP-46, XP-49–55 |
| Chỉ bàn phím; screen reader trên các luồng chính; reduced motion | XP-04, XP-13, XP-37–40, XP-48, XP-51–55 |
| Nhóm đổi role/remove trong khi member/search/viewer panel vẫn đang mở | XP-19, XP-25–30, XP-35, XP-43 |

Mỗi lần triển khai chạy `npm run verify` theo quy ước. XP-11 và thay đổi security/auth/migration
chạy `npm run verify:full`. Luồng thay đổi cần browser/API thật và regression đúng lỗi đã gặp;
thay đổi thị giác nhỏ, đảo ngược dễ thì kiểm tra thủ công/ảnh trước–sau, không viết test chỉ lặp lại implementation.

Browser E2E Vite không chứng minh CSP/service worker của build; XP-31 và XP-58 cần local build
cách ly với database/uploads test và origin riêng, không đổi cổng dev của người dùng hoặc dùng dữ liệu thật.
Thử Firefox/WebKit, touch emulation và thiết bị thật ở các luồng nhạy cảm nếu môi trường hỗ trợ;
thiếu thiết bị phải ghi rõ. Không triển khai public để nghiệm thu backlog này.

## Gói bắt đầu và sổ theo dõi

Gói bắt đầu gồm **XP-01 + XP-11**, xử lý riêng từng lỗi, rồi **XP-02 + XP-03** cho composer.
Tiếp theo là **XP-07–10 + XP-12** để mọi thao tác có phản hồi đáng tin. XP-31 có thể chạy độc lập sớm
vì nó xác nhận các preview người dùng đang dùng có hoạt động trên web build.

Chỉ bắt đầu gói tiếp theo khi hành vi của gói hiện tại có thể xem và kiểm chứng được. Backlog này là
danh sách đầy đủ để triển khai dần, không phải yêu cầu làm 60 đầu việc cùng lúc hoặc thay toàn bộ giao diện.

| ID | Trạng thái thay đổi so với mặc định | Kết quả/kiểm chứng | Ngày |
| --- | --- | --- | --- |
| XP-01 | next | Đã tái hiện lỗi nháp trong audit; chưa sửa | 2026-09-05 |
| XP-11 | next | Đã tái hiện lỗi edit history trong audit; chưa sửa | 2026-09-05 |

Khi triển khai, thêm/cập nhật dòng đúng ID tại đây. Trạng thái `done` cần ghi môi trường, lệnh hoặc
kịch bản đã kiểm tra và giới hạn còn lại. Nếu một mục được bỏ sau kiểm tra vì hành vi hiện tại đã đúng,
ghi `dropped` cùng căn cứ để tránh người sau làm lại.
