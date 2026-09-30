# Ticketbox · Canh vé

Extension Chrome / Edge Manifest V3, cấu hình sẵn **RADIANT × 4** cho sự kiện 26611. Chạy trên giao diện Ticketbox bằng phiên đăng nhập hiện có. Không cần build hoặc cài Node để sử dụng.

Bản **1.0.5**: **Vào thẳng trang chọn vé** dùng cùng lịch hẹn và đồng hồ với mode **Canh giờ mở bán**. Mở tab sự kiện hoặc trang chọn vé, nhập ngày giờ, chọn **Đúng giờ mở bán** hoặc **Trước giờ mở bán** cùng số ms tải sớm, bấm **Đo giờ** rồi **Hẹn giờ vào trang chọn vé**. Đến mốc đã chọn, extension tự mở link chọn vé trong tab đang canh; nếu đã ở trong và chưa chọn vé thì tải lại trang. Ví dụ mở bán 12:00, tải sớm 1000 ms → mở link lúc 11:59:59. Đóng popup vẫn tiếp tục hẹn giờ.

Sau khi vào trang, tool dùng flow chọn vé hiện tại: chờ nút số lượng mở, chọn đủ vé rồi bấm Tiếp tục. Tùy chọn bấm sớm, tải thêm lúc đúng giờ, tải định kỳ và giới hạn lượt vẫn áp dụng. **Giữ trang chọn vé** chặn các lượt tải sau lượt đầu; tắt tùy chọn này nếu muốn tải lại lúc đúng giờ sau khi đã vào sớm. Có vé trong giỏ, đang chờ tăng vé hoặc CAPTCHA thì hoãn tải. Mode **Canh giờ mở bán** vẫn là mặc định.

CAPTCHA bất ngờ được theo dõi trong cả hai mode. Bản 1.0.4 bắt thêm tín hiệu thành công khi widget đóng rất nhanh hoặc worker đang lưu trạng thái chờ; bỏ qua thông báo thành công đang ẩn. Nếu CAPTCHA chặn lần bấm `+`, sau khi giải xong sẽ đọc lại số lượng thực tế và tiếp tục từ đó. Sau khi tiếp tục qua CAPTCHA, phiên còn ít nhất 5 phút để hoàn thành flow. Cập nhật bằng cách Reload extension và tải lại tab Ticketbox trước khi bắt đầu phiên mới.

Bản **1.0.3** thêm chờ CAPTCHA thủ công và tiếp tục sau khi xác minh, áp dụng cả nút Mua vé ngay và Tiếp tục. Chi tiết bên dưới. Reload extension và tab để nhận bản mới; popup và script trong tab được kiểm tra cùng phiên bản.

Bản **1.0.2** dùng URL hiện tại của tab để kiểm tra bước Tiếp tục sau điều hướng trong cùng trang; khi từ chối bấm sẽ dừng và nêu lý do, không lặp im lặng. Kiểm thử luồng chọn vé dùng nguyên component trong `cpn5.txt`. Popup hiển thị số phiên bản và có **Kiểm tra nút Tiếp tục**: chỉ đọc nút/phiên bản/trạng thái, không bấm hoặc gửi đơn. Nếu còn lỗi trên trang thật, sao chép kết quả này để xác định điều kiện đang chặn. Khi Bắt đầu, extension cũng kiểm tra phiên bản script trong tab có khớp hay không. Chưa xác nhận bản này khắc phục trường hợp live chỉ từ ảnh cũ; cần trạng thái hoặc kết quả chẩn đoán trên tab đang lỗi.

Bản **1.0.1** sửa việc nhận nhầm nút Tiếp tục là bị khóa khi vùng chứa có `pointer-events: none` nhưng nút cho phép `auto`; nhận class `bottomBooking` ở cả nút và vùng chứa, ưu tiên bản nút khả dụng. Nhật ký chờ nêu rõ lý do. Để cập nhật bản đã cài: bấm Dừng, Reload extension trong `chrome://extensions`, tải lại tab Ticketbox, rồi Đo giờ và Bắt đầu lại. Tải lại tab có thể làm mất lựa chọn vé hiện tại; nếu đang có giỏ muốn giữ, hãy bấm Tiếp tục bằng tay trước khi cập nhật.

## Cài đặt

1. Vào `chrome://extensions` (Edge: `edge://extensions`).
2. Bật **Developer mode** → **Load unpacked** → chọn thư mục `D:\ticket-auto\extension`.
3. Ghim extension. Đăng nhập Ticketbox, mở trang sự kiện hoặc link trang chọn vé. Nếu tab mở trước khi cài extension, tải lại một lần.
4. Mở popup, kiểm tra link, tên hạng vé **RADIANT** và số lượng **4**.
5. Chọn **Canh giờ mở bán** hoặc **Vào thẳng trang chọn vé**; cả hai đều nhập **ngày và giờ mở bán theo Việt Nam (UTC+7)**, chọn tải đúng giờ hoặc tải sớm, bấm **Đo giờ**, rồi bấm nút bắt đầu/hẹn giờ. Mode vào thẳng sẽ tự mở link chọn vé ở mốc đã chọn.
6. Giữ tab vé ở phía trước, máy không ngủ. Nút **Dừng** trong popup/trên trang hoặc phím **Esc** sẽ ngừng tự động.

Chỉ có một phiên hoạt động trên một tab. Đóng popup vẫn chạy; đóng tab sẽ dừng. Đóng trình duyệt sẽ mất phiên đang chạy; cấu hình vẫn được lưu. Phiên kết thúc sau 5 phút tính từ giờ mở bán, hoặc 5 phút sau lúc bắt đầu nếu đã qua giờ mở bán. Khi phát hiện một lượt CAPTCHA mới, hạn phiên được kéo dài tối thiểu 10 phút từ lúc đó để người dùng giải tay; không kéo dài liên tục theo mỗi lần kiểm tra.

## CAPTCHA kéo mảnh ghép / YesCaptcha

Ảnh bạn đưa là thử thách kéo mảnh ghép, gắn thương hiệu Ticketbox. HTML lưu có bộ CSS riêng `--tbox-captcha-*`, `captcha-module_wrapper__…`, `captcha-module_dragSlideBar__…`, `captcha-module_messageSuccess__…`. Đây là bằng chứng để nhận diện widget trên trang; không đủ để kết luận tên nhà cung cấp hoặc giao thức xác minh phía server.

Đã kiểm tra [YesCaptcha Documentation](https://yescaptcha.atlassian.net/wiki/spaces/YESCAPTCHA/pages/64192513/YesCaptcha+Documentation) và [danh sách loại tác vụ](https://yescaptcha.atlassian.net/wiki/spaces/YESCAPTCHA/pages/64192755/Princing+Table): tài liệu công khai liệt kê OCR chữ/số, reCAPTCHA, hCaptcha, FunCaptcha, Turnstile và Cloudflare, không thấy task cho slider tùy biến của Ticketbox. `ImageToTextTask` là OCR chữ/số, không phải API giải mảnh ghép. Chưa có bằng chứng YesCaptcha hỗ trợ widget này, nên bản này không thu thập API key và không gửi ảnh hay token sang YesCaptcha. Không suy từ ảnh để gọi API của một nhà cung cấp khác.

Luồng xử lý:

1. Phát hiện widget CAPTCHA hiển thị → báo **bạn giải trên trang**. Giữ nguyên giỏ, ngừng tăng vé, ngừng bấm Mua vé/Tiếp tục và ngừng mọi lượt tải lại tự động.
2. Theo dõi class thành công `captcha-module_messageSuccess__…` trong widget. Giữ được dấu hiệu này cả khi widget bị tháo khỏi DOM ngay sau khi hiện thông báo.
3. Sau tín hiệu thành công và khi hộp đóng, chờ ngắn 250 ms cho callback của trang chạy. Nếu vẫn ở bước cũ và nút khả dụng, tiếp tục/bấm lại đúng một lần; kiểm tra lại hạng và số lượng trước khi bấm Tiếp tục.
4. Nếu trang đã tự chuyển sang bước tiếp theo, dừng thao tác chọn vé; không bấm lại nút cũ. Nếu CAPTCHA lặp lại, chờ giải tiếp, tối đa 3 lần tiếp tục qua CAPTCHA mỗi phiên.
5. Chỉ đóng hộp, hủy hoặc không nhìn thấy được tín hiệu thành công **không được xem là đã giải**. Khi hộp đã đóng, bảng góc trang có nút **Tôi đã giải xong · tiếp tục** để bạn xác nhận. Đây cũng là fallback cho iframe khác origin mà content script không đọc được nội dung.
6. Esc/Dừng vẫn hủy phiên ngay. Sau khi bấm Tiếp tục mà 15 giây không có chuyển bước hoặc CAPTCHA, tool dừng để bạn kiểm tra, không gửi lặp vô hạn.

Nhận diện thành công dựa vào trạng thái giao diện; không giả token, không tự kéo slider, không xác nhận thay cho máy chủ. Kiểm thử dùng widget mô phỏng theo ảnh và các class CSS trong HTML lưu; chưa kiểm thử với CAPTCHA live. Nếu Ticketbox đổi class hoặc cách hiển thị thành công, dùng fallback xác nhận thủ công và gửi kết quả **Kiểm tra nút Tiếp tục** (có trạng thái CAPTCHA) để đối chiếu.

## Chọn mode cho từng tình huống

| Tình huống | Cấu hình |
| --- | --- |
| Có link chọn vé, muốn tự vào theo lịch | **Vào thẳng trang chọn vé** → nhập giờ → chọn tải đúng giờ hoặc sớm → **Đo giờ** → **Hẹn giờ vào trang chọn vé**. Nếu link chuyển về trang sự kiện, các lượt fallback/tải tiếp được bật sẽ mở lại link theo lịch; cập nhật link nếu đã hết hạn. |
| Đang ngoài, nút khóa trước 12:00 | Mặc định **Đúng giờ mở bán**. Nếu nút vẫn khóa, tải lại một lần lúc đồng hồ đo được đến 12:00. |
| Muốn tải trang trước để chuẩn bị | **Trước giờ mở bán**, nhập khoảng sớm, ví dụ 1000 ms. Bật fallback để tải thêm lúc đúng giờ nếu chưa vào được. 1000 ms là giá trị thử, chưa được chứng minh tối ưu. |
| Nút mua hoặc vé mở sớm | Bật **Nút mở sớm → bấm ngay**. Nút hợp lệ sẽ được bấm trước cả lịch tải lại. |
| Đã ở trong link chọn vé và danh sách tự cập nhật | Bật **Giữ trang trong** để tránh mất thời gian điều hướng. Theo dõi dòng vé trên trang. |
| Đã ở trong nhưng danh sách đứng yên / còn báo hết vé | Tắt **Giữ trang trong**, chọn tải đúng giờ. Có thể bật tải tiếp với chu kỳ mặc định 5 giây, tối thiểu 3 giây, giới hạn mặc định 12 lượt. |
| Muốn tuyệt đối không chọn vé trước 12:00 | Tắt **Nút mở sớm → bấm ngay**. |

**Nên F5 đúng giờ hay trước?** Chưa có dữ liệu để kết luận một khoảng sớm luôn thắng. Mặc định tải đúng giờ có cơ sở hơn khi nội dung trước giờ vẫn đóng: tải sớm có thể nhận lại trạng thái chưa mở bán. Nếu nút đã mở hoặc đã vào trang chọn vé đang hoạt động, bấm/chọn ngay giúp bỏ một lượt tải trang. Đây là suy luận kỹ thuật, không phải cam kết thắng hàng chờ hoặc giữ được vé.

Giữ trang trong có nghĩa là **không tải lại**, kể cả khi bật tải định kỳ; riêng mode vào thẳng vẫn thực hiện lượt tải đầu theo lịch nếu giỏ chưa có vé. Theo dõi DOM chỉ thấy thay đổi mà chính trang nhận được; nó không tự truy vấn tồn kho phía server. Khi đã có vé trong giỏ hoặc đang chờ một lần bấm `+`, mọi lượt tải tự động đều ngừng để tránh mất lựa chọn.

## Đồng hồ và giả định cache 45 phút

Mặc định lấy 3 mẫu HEAD từ trang sự kiện, chọn mẫu có RTT thấp nhất. Nếu HEAD bị từ chối, thử trang chủ Ticketbox; popup hiển thị rõ URL nguồn. Ước tính ở lúc nhận phản hồi:

`HTTP Date + Age thực tế + RTT/2`

Sau đó chạy đồng hồ đếm bằng thời gian đơn điệu trong tab. Tại thời điểm điều tra 30/09/2026, HEAD trang chủ trả `Cache-Control: public,max-age=3600`, `Age: 3178`, `X-TKB-Cache: hit`; HEAD trang sự kiện trả 403 từ môi trường phát triển. Một mẫu này không chứng minh cấu hình toàn hệ thống, nhưng đủ để không mặc định mọi phản hồi chậm đúng 45 phút.

Theo [RFC 9111 §5.1](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.1), `Age` biểu thị tuổi ước tính của phản hồi; `max-age` là thời gian còn được xem là fresh, không phải độ chậm cố định của đồng hồ. Xem thêm [tính tuổi phản hồi](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2.3).

- **Tự động:** dùng Date + Age. Cache HIT thiếu Age sẽ bị từ chối vì không đủ dữ liệu.
- **Thủ công:** chọn `HTTP Date + số phút bù`, nhập **45** để cộng đúng 45 phút như yêu cầu. Giá trị này thay thế Age, không cộng chồng. Chỉ dùng khi có bằng chứng bù này đúng với phản hồi thực tế.
- **Đồng hồ máy:** sử dụng giờ hệ điều hành, phù hợp khi không đo được HTTP. Bấm Đo giờ để xác nhận nguồn này trước khi bắt đầu.

HTTP/CDN không phải đồng hồ máy chủ xử lý giữ vé. Date/Age có độ phân giải giây và chịu ảnh hưởng mạng/cache; popup hiển thị sai số ước tính tối thiểu khoảng một giây cộng RTT/2. Không có căn cứ để cam kết canh đến mili giây. Mẫu giờ phải mới trong 15 phút khi bắt đầu. Nên đo và bật canh gần giờ mở bán; đồng hồ không tự đồng bộ lại giữa phiên để tránh làm nhảy lịch đã chọn.

## Luồng thao tác

1. Ngoài trang: kiểm tra nút `#buynow-btn` hiển thị và không disabled rồi bấm một lần. Nếu xuất hiện bước chọn suất, đăng nhập hoặc cửa sổ khác, xử lý trên trang. Extension không tự đoán suất diễn.
2. Trong trang: tìm đúng `.tbox-row.row-default` có tên **Hạng vé RADIANT**; không dùng chữ trong phần tóm tắt, không nhầm GOLD/DIAMOND. Tên trong HTML là RADIANT, không phải RADIENT.
3. Nếu có vé hạng khác trong giỏ hoặc có nhiều dòng trùng tên, dừng để người dùng xử lý.
4. Bấm `+` từng lần, đọc lại số lượng mà trang xác nhận. Không sửa trực tiếp input readonly. Nếu một lần bấm chưa được xác nhận sau 3,5 giây, dừng để kiểm tra.
5. Đủ chính xác 4 vé, không có vé khác và nút khả dụng → bấm **Tiếp tục** một lần. Khóa này lưu trước khi bấm và tồn tại qua tải trang/service-worker khởi động lại. Chỉ mở lại khóa cho một lần bấm nữa nếu đã gặp CAPTCHA và xác nhận giải xong như luồng trên.
6. Tool còn theo dõi chuyển trang/CAPTCHA sau lần bấm. Khi sang bước tiếp theo, bạn hoàn tất biểu mẫu, xác nhận thông tin và thanh toán. **Bấm Tiếp tục không đồng nghĩa đã giữ vé thành công.** Nếu trang báo lỗi khác, xử lý rồi chủ động bắt đầu phiên mới.

Trong ảnh/HTML đã gửi, RADIANT đang **Hết vé**. Extension chờ vé được trang công bố khả dụng, không bật giả nút disabled, không tăng vượt giới hạn trang. CAPTCHA do bạn giải tay; hàng chờ do trang điều phối.

Link `/events/26611/bookings/40591273081648/select-ticket` được điền sẵn theo dữ liệu bạn đưa, nhưng chưa xác minh booking này còn hiệu lực với phiên đăng nhập của bạn. Nếu link hết hạn, lấy link mới từ luồng Mua vé ngay rồi cập nhật popup. Extension nhận booking ID mới nếu vẫn thuộc đúng sự kiện 26611 trong tab đang canh.

## Khảo sát mã nguồn và công cụ

- [TicketBox Script Auto Buy — actuallyme98](https://gist.github.com/actuallyme98/7db61b1e9c75fbca315631e7a69e7e13): mã công khai gọi `/api/event/.../ticket-booking/...`, có submit thông tin, biểu mẫu và order. URL của bạn là `/events/.../bookings/.../select-ticket`; không có bằng chứng API cũ tương thích. Gist không cung cấp benchmark chứng minh nhanh hơn ở sự kiện này. Không sao chép mã đó vào extension.
- [Ticketbox Bot — A's Solution](https://asolution.dev/ticketbox-bot): trang nhà cung cấp quảng cáo auto checkout. Đây là mô tả của bên bán, không phải xác minh độc lập về tỷ lệ thành công, độ trễ hoặc tương thích với sự kiện này.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): extension dùng content script trong tab, quan sát DOM và thao tác với giao diện hiện có.
- [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms): alarms có giới hạn và có thể bị trì hoãn. Vì vậy canh giờ ở tab bằng bộ đếm, không dùng alarm để hứa canh chính xác. Tab nền, máy ngủ và mạng nghẽn vẫn gây trễ.

Lợi thế thực tế mà bản này hướng đến là giảm thao tác tay, phát hiện nút vừa mở, bỏ lượt điều hướng khi đã ở trong, và giữ đúng một luồng giỏ vé. Không có benchmark live để định lượng lợi thế hoặc tỷ lệ mua thành công.

## Kiểm thử và cấu trúc

`npm ci` rồi `npm test` (Node 22 trở lên). Dependency jsdom chỉ phục vụ kiểm thử; extension không tải mã bên thứ ba và không cần dependency khi chạy.

Kiểm thử dựa trên hai HTML và component bạn cung cấp; mô phỏng RADIANT có hàng để kiểm tra 4 lần tăng và một lần Tiếp tục; kiểm tra giờ/cache, sai sự kiện, trạng thái disabled, hết vé, giỏ lẫn hạng, giới hạn số lượng, khóa tab, claim đồng thời và khởi động lại worker. jsdom không có layout nên test giả lập hình học hiển thị và loại CSS generated lớn; không thay thế Chrome thật/React live.

Kết nối Browser trong môi trường phát triển bị lỗi khởi tạo `Cannot redefine property: process`, nên chưa chạy được kiểm thử trực quan Chrome hoặc giao dịch live. Không có đơn/vé thật nào được tạo khi kiểm thử.

- `extension/`: chọn thư mục này khi Load unpacked.
- `tests/`: kiểm thử logic và DOM trên snapshot.
- HTML/PNG/TXT gốc: giữ nguyên để đối chiếu.

Quyền extension: storage, activeTab và host `https://ticketbox.vn/*`. Cấu hình lưu cục bộ, phiên chạy lưu trong storage session; không có máy chủ riêng hay telemetry. Yêu cầu HEAD đo giờ gửi đến Ticketbox, còn thao tác mua đi qua giao diện và phiên đăng nhập của trang.
