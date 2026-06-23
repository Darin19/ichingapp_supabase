# Canvas File v1 — Contract and Data Dictionary

## 1. Mục đích và phạm vi

`Canvas File v1` là định dạng JSON trung gian để một Canvas có thể được export khỏi ứng dụng, sinh bởi AI/công cụ bên ngoài và import trở lại mà không cần gọi AI từ ứng dụng.

Contract v1 bao gồm metadata, cards/nodes, vị trí, trạng thái, master/custom labels và relations. Contract không bao gồm viewport, trạng thái random deck, kích thước card hoặc z-index vì các dữ liệu này hiện không được lưu theo Canvas.

File tối đa 5 MiB. Importer v1 chấp nhận tối đa 500 nodes, 2.000 labels và 2.000 relations.

## 2. Mapping với source hiện tại

| Thành phần      | Source hiện tại                                                     | Mapping file v1                                                                  |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Canvas state    | `SpreadCard[]` trong `src/types.ts` và `CardDrawingView.tsx`        | `nodes[]`                                                                        |
| Card master     | `DeckCard`, `IChingCard`, `TarotCard`; dữ liệu trong `constants.ts` | `type`, `cardId`, `cardNumber`, `displayName`                                    |
| Vị trí          | `SpreadCard.x`, `SpreadCard.y`                                      | `position.x`, `position.y`                                                       |
| Tarot state     | `SpreadCard.isReversed`                                             | `upright → false`, `reversed → true`                                             |
| I Ching state   | `SpreadCard.polarity`                                               | `positive → positive`, `negative → negative`, `neutral → null`                   |
| Label trên card | `SpreadCard.labels: string[]`                                       | `nodes[].labelIds` sau khi resolve file-label ID sang internal label ID          |
| Master label    | Bảng `labels`, `label_groups`                                       | `labels[]` với `source: master`                                                  |
| Custom label    | Chưa có canvas-local model                                          | `labels[]` với `source: custom`; lưu trong metadata của Canvas, không ghi master |
| Canvas metadata | `CanvasMetadata` và bảng `canvases`                                 | `metadata`                                                                       |
| Relations       | Chưa hỗ trợ                                                         | Lưu và round-trip trong metadata; v1 chưa render                                 |

Không có chức năng file import/export sẵn trong source hiện tại. Auto-Draw cũ nằm trong `CardDrawingView.tsx`, `src/lib/autoDraw.ts`, Supabase Edge Function `generate-canvas` và RPC `apply_auto_draw_result`.

### 2.1 Nguồn master card chuẩn

I Ching được đối chiếu với `iching_cards_master.xlsx`. Export database có 18 cột:

| Cột master I Ching                 | Vai trò với Canvas File v1                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `id`                               | Nguồn chuẩn cho `nodes[].cardId`, hiện có dạng `hexagram-1` đến `hexagram-64`     |
| `deck_type`                        | Phải là `iching`, dùng kiểm tra `nodes[].type`                                    |
| `number`                           | Nguồn chuẩn cho `nodes[].cardNumber`, miền 1–64                                   |
| `sort_order`                       | Không đưa vào file; chỉ phục vụ sắp xếp master data                               |
| `vietnamese_name`                  | Nguồn chuẩn cho `nodes[].displayName` khi export                                  |
| `english_name`                     | Dùng làm alias fallback khi resolve name; không thay thế `displayName` sau import |
| `link1`, `link2`, `link3`          | Không copy vào file; luôn đọc từ master hiện tại                                  |
| `content1`, `content2`, `content3` | Không copy vào file để tránh payload lớn và stale master content                  |
| `img_path`, `image_url`            | Không copy; renderer dùng asset/master data hiện tại                              |
| `keywords`                         | Không copy; chỉ thuộc master card catalog                                         |
| `uid`                              | Không copy; không phải định danh card nghiệp vụ                                   |
| `created_at`, `updated_at`         | Không copy; là timestamp của master row, không phải Canvas                        |

Tám quẻ trong sample đã được so khớp theo bộ ba `id + number + vietnamese_name` với file Excel: `hexagram-1`, `14`, `31`, `44`, `43`, `58`, `17`, `60`.

Tarot không có bảng master riêng trong migration hiện tại. Catalog chuẩn được tạo trong `src/constants.ts` từ các file `src/assets/tarot/*` với các field `id`, `deckType`, `number`, `sortOrder`, `vietnameseName`, `englishName`, `imgPath`, `imageUrl`, `fileName`. Canvas File chỉ mang `cardId`, `cardNumber`, `displayName`; hình ảnh và `fileName` tiếp tục được resolve từ code/assets.

`random_deck_cards.xlsx` là nguồn kiểm chứng persistence, không phải master metadata. Bảng có các cột `deck_type`, `deck_id`, `id`, `source_card_id`, `number`, `current_location`, `draw_sequence`, `sort_order`, `added_at`, `updated_at`. Khi kiểm tra sample:

- Cả 8 `cardId` Tarot đều tồn tại dưới `source_card_id` với `deck_type: tarot`.
- `number` trong database khớp `cardNumber` của sample.
- Mỗi Tarot xuất hiện ba lần vì export chứa ba random decks; đây không phải ba master cards khác nhau.
- `random_deck_cards.id` là ID instance trong deck; Canvas File phải dùng `source_card_id` làm `cardId`.

Như vậy, Tarot được resolve metadata từ code/assets và được xác nhận ID/number bằng dữ liệu Supabase. Tám Tarot trong sample đã được đối chiếu với cả hai nguồn này.

## 3. Root object

| Trường          | Kiểu   | Bắt buộc | Giá trị hợp lệ                | Mặc định / hành vi                                                             |
| --------------- | ------ | -------: | ----------------------------- | ------------------------------------------------------------------------------ |
| `format`        | string |       Có | Chỉ `iching-canvas`           | Sai giá trị: từ chối file                                                      |
| `schemaVersion` | string |       Có | Chỉ `1.0.0` trong importer v1 | Version khác: từ chối và báo version không hỗ trợ                              |
| `metadata`      | object |       Có | Theo mục 4                    | Thiếu: từ chối                                                                 |
| `labels`        | array  |       Có | 0–2.000 phần tử theo mục 5    | Có thể là `[]`                                                                 |
| `nodes`         | array  |       Có | 0–500 phần tử theo mục 7      | Cho phép Canvas rỗng                                                           |
| `relations`     | array  |       Có | 0–2.000 phần tử theo mục 8    | Có thể là `[]`                                                                 |
| `extensions`    | object |       Có | JSON object bất kỳ            | Exporter luôn ghi `{}` nếu không có; importer lưu nguyên nhưng không diễn giải |

Ngoài `extensions`, root object không chấp nhận trường lạ. Quy tắc này bắt được typo thay vì âm thầm bỏ dữ liệu.

## 4. `metadata`

| Trường         | Kiểu   | Bắt buộc | Giá trị hợp lệ                                     | Mặc định / hành vi                         |
| -------------- | ------ | -------: | -------------------------------------------------- | ------------------------------------------ |
| `name`         | string |       Có | 1–200 ký tự sau khi trim                           | Dùng làm tên Canvas; chuỗi rỗng bị từ chối |
| `description`  | string |    Không | Chuỗi UTF-8 bất kỳ                                 | `""`                                       |
| `sourceScript` | string |    Không | Nội dung script/kịch bản UTF-8                     | `""`                                       |
| `noteMarkdown` | string |    Không | Markdown UTF-8                                     | `""`; map sang Canvas Note                 |
| `createdAt`    | string |       Có | RFC 3339 `date-time`, ví dụ `2026-06-23T00:00:00Z` | Sai timestamp: từ chối                     |
| `updatedAt`    | string |       Có | RFC 3339 `date-time`                               | Sai timestamp: từ chối                     |

Importer kiểm tra `updatedAt` không sớm hơn `createdAt`. Database có thể dùng timestamp riêng cho thời điểm persistence; contract timestamps vẫn được giữ để round-trip.

## 5. `labels[]`

Mỗi `labels[].id` là khóa duy nhất trong phạm vi file và là giá trị được tham chiếu bởi `nodes[].labelIds`. Hai label trong cùng file không được trùng `id`.

### 5.1 Trường chung

| Trường        | Kiểu        | Bắt buộc | Giá trị hợp lệ                                  | Hành vi                     |
| ------------- | ----------- | -------: | ----------------------------------------------- | --------------------------- |
| `id`          | string      |       Có | Không rỗng; custom bắt buộc có prefix `custom:` | Trùng ID: từ chối file      |
| `source`      | string enum |       Có | `master`, `custom`                              | Giá trị khác: từ chối       |
| `name`        | string      |       Có | Không rỗng                                      | Dùng để resolve và hiển thị |
| `group`       | object      |       Có | Theo mục 6                                      | Thiếu: từ chối              |
| `description` | string      |    Không | Chuỗi UTF-8 bất kỳ                              | `""`                        |

### 5.2 `source: master`

- `id` nên là UUID thật từ bảng `labels`; exporter luôn dùng master ID thật.
- Importer resolve theo thứ tự:
  1. Exact `labels[].id` trong master data.
  2. Exact `group.id` + normalized `name`.
  3. Exact normalized `group.name` + normalized `name`.
- Không resolve chỉ theo label name toàn cục. Excel có các tên trùng như Venus, Mercury, Mars, Saturn và Pluto ở nhiều group.
- Nếu không resolve được, importer tạo bản canvas-local với ID mới thuộc namespace `custom:imported:*`, giữ name/group/description và phát warning. Không có INSERT/UPDATE vào master tables.

### 5.3 `source: custom`

- `id` phải khớp `^custom:[A-Za-z0-9][A-Za-z0-9._:-]*$`.
- `group.id` phải khớp namespace `custom-group:*`.
- Label tồn tại trong Canvas hiện tại và Saved Canvas, có thể gắn/bỏ khỏi card, được export lại nhưng không xuất hiện trong Master Data Label.
- V1 không hỗ trợ promote custom label thành master label.

## 6. `labels[].group`

| Trường | Kiểu   |                           Master |   Custom | Giá trị hợp lệ                                                       |
| ------ | ------ | -------------------------------: | -------: | -------------------------------------------------------------------- |
| `id`   | string | Không bắt buộc nhưng khuyến nghị | Bắt buộc | Master: ID thật hoặc khóa không rỗng; custom: prefix `custom-group:` |
| `name` | string |                         Bắt buộc | Bắt buộc | Tên group không rỗng                                                 |

Master group name được so khớp sau khi trim, chuyển lowercase và chuẩn hóa Unicode. Custom group chỉ sống trong Canvas.

## 7. `nodes[]`

### 7.1 Trường chung

| Trường        | Kiểu        | Bắt buộc | Giá trị hợp lệ                                          | Mapping / hành vi                                                                                  |
| ------------- | ----------- | -------: | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id`          | string      |       Có | Không rỗng, duy nhất trong file                         | Map sang `SpreadCard.id`; cùng một master card có thể xuất hiện ở nhiều node nếu node ID khác nhau |
| `type`        | string enum |       Có | `tarot`, `iching`                                       | Phải khớp deck type của card đã resolve                                                            |
| `cardId`      | string      |       Có | ID không rỗng                                           | Resolve ưu tiên đầu tiên                                                                           |
| `cardNumber`  | integer     |       Có | I Ching: 1–64; Tarot: số index hiện tại, ≥0             | Fallback thứ hai và dùng để kiểm tra metadata                                                      |
| `displayName` | string      |       Có | Không rỗng                                              | Fallback cuối nếu name là duy nhất trong đúng deck; UI vẫn dùng master card name                   |
| `position`    | object      |       Có | `{ x, y }`                                              | Map trực tiếp sang `SpreadCard.x/y`                                                                |
| `state`       | string enum |       Có | Phụ thuộc `type`, xem mục 7.2                           | Sai enum/type: từ chối                                                                             |
| `order`       | integer     |       Có | ≥1, duy nhất trong file                                 | Map sang `drawSequence` và `placedSequence`; nodes được sort tăng dần                              |
| `labelIds`    | string[]    |       Có | Unique trong node; mỗi ID phải tồn tại trong `labels[]` | Dangling label ID: từ chối                                                                         |

Card resolution theo thứ tự `cardId` → `type + cardNumber` → unique normalized `type + displayName`. Nếu fallback được dùng, importer hiển thị warning. Không resolve được card là lỗi chặn; importer không tạo card master mới.

### 7.2 `state`

| `type`   | Giá trị file | Giá trị nội bộ                            |
| -------- | ------------ | ----------------------------------------- |
| `tarot`  | `upright`    | `isReversed: false`, `polarity: null`     |
| `tarot`  | `reversed`   | `isReversed: true`, `polarity: null`      |
| `iching` | `positive`   | `polarity: positive`, `isReversed: false` |
| `iching` | `neutral`    | `polarity: null`, `isReversed: false`     |
| `iching` | `negative`   | `polarity: negative`, `isReversed: false` |

Tarot không được dùng `positive/neutral/negative`; I Ching không được dùng `upright/reversed`.

### 7.3 `position`

| Trường | Kiểu   | Bắt buộc | Giá trị hợp lệ                |
| ------ | ------ | -------: | ----------------------------- |
| `x`    | number |       Có | Số JSON hữu hạn; được phép âm |
| `y`    | number |       Có | Số JSON hữu hạn; được phép âm |

JSON không biểu diễn `NaN` hoặc `Infinity`. Canvas hỗ trợ pan nên contract không giới hạn min/max tọa độ.

## 8. `relations[]`

Relations v1 được validate, lưu theo Canvas và export lại nhưng chưa được vẽ trên Canvas.

| Trường  | Kiểu        | Bắt buộc | Giá trị hợp lệ                                                            | Hành vi                |
| ------- | ----------- | -------: | ------------------------------------------------------------------------- | ---------------------- |
| `id`    | string      |       Có | Không rỗng, duy nhất                                                      | Trùng: từ chối         |
| `type`  | string enum |       Có | `supports`, `clarifies`, `contrasts`, `follows`, `groups-with`, `related` | Giá trị khác: từ chối  |
| `from`  | string      |       Có | Node ID tồn tại                                                           | Dangling ID: từ chối   |
| `to`    | string      |       Có | Node ID tồn tại và khác `from`                                            | Self-relation: từ chối |
| `label` | string      |    Không | Chuỗi UTF-8                                                               | `""`                   |

Ý nghĩa enum:

- `supports`: node nguồn bổ sung/củng cố node đích.
- `clarifies`: node nguồn là clarifier hoặc diễn giải cụ thể node đích.
- `contrasts`: hai node tạo đối trọng hoặc cảnh báo trái chiều.
- `follows`: node đích diễn ra sau node nguồn trong chuỗi ý nghĩa.
- `groups-with`: hai node thuộc cùng một cụm/chủ đề.
- `related`: có liên hệ nhưng không thuộc năm quan hệ cụ thể trên.

## 9. `extensions`

`extensions` là JSON object mở. V1 không dùng nội dung bên trong để render hoặc thay đổi Canvas. Importer lưu nguyên và exporter trả lại nguyên vẹn. Các trường chưa được chuẩn hóa phải nằm dưới `extensions`; trường lạ ở root/metadata/label/node/relation là lỗi schema.

## 10. Validation errors và warnings

### Lỗi chặn, không thay Canvas hiện tại

- File không phải JSON hoặc lớn hơn 5 MiB.
- Sai `format`/`schemaVersion`.
- Thiếu trường bắt buộc hoặc có trường lạ ngoài `extensions`.
- Timestamp sai, `updatedAt < createdAt`.
- Quá giới hạn labels/nodes/relations.
- Trùng label/node/relation ID hoặc trùng node order.
- Card không resolve được hoặc resolved deck type không khớp.
- State không hợp lệ cho card type.
- Node tham chiếu label không tồn tại.
- Relation có endpoint không tồn tại hoặc `from === to`.

### Warning, vẫn cho phép xác nhận import

- Card được resolve bằng number/name fallback thay vì `cardId`.
- Master label chỉ resolve được bằng group/name fallback.
- Master label không còn tồn tại và được chuyển thành canvas-local custom label.
- `extensions` chứa dữ liệu mà v1 không diễn giải.

Validation và preview hoàn tất trước mọi thay đổi state/RPC. Chỉ sau khi người dùng xác nhận “Replace Canvas” mới gọi transaction thay Canvas; RPC thất bại phải giữ nguyên Canvas hiện tại.

## 11. Sample coverage

`canvas-file-v1.sample.json` chứa 16 nodes từ `Kịch bản.docx`:

- I Ching: 1, 14, 31, 44, 43, 58, 17, 60.
- Tarot theo display name hiện tại của app: Magician, Six of Wands, Devil, Queen of Wands, Page of Cups, Knight of Wands, Two of Cups, Temperance. DOCX dùng tên quen thuộc “The Magician” và “The Devil”.
- Phủ đủ `positive`, `neutral`, `negative`, `upright`, `reversed`.
- Dùng master label UUID thật từ `labels.xlsx`/`label_groups.xlsx` và custom label `custom:controlled-pursuit`.
- Có tọa độ hai hàng và 10 relations.

Để kiểm thử đủ enum, Hexagram 44 được đặt `negative` và The Devil được đặt `reversed`. Đây là fixture kỹ thuật có chủ ý, không phải thay đổi diễn giải gốc trong DOCX.
