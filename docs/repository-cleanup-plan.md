# Plan dọn dẹp repository GitHub

Ngày lập: 2026-08-31  
Nguồn tham chiếu: C:\Users\Kim Duc\Desktop\Dọn dẹp repo GitHub.pdf (30/08/2026)

## 1. Phân biệt yêu cầu và nội dung tài liệu

### Yêu cầu trực tiếp

- Có một file plan dùng được cho việc rà soát và dọn dẹp repository.
- Không thay đổi kiến trúc hoặc business logic nếu không cần thiết.
- Mọi thao tác xóa phải có bằng chứng từ import/reference/build/test.

### Khuyến nghị từ PDF

PDF là báo cáo audit và đề xuất thực hiện, không phải lệnh xóa mù quáng. Các mục có từ "ứng viên", "nếu", "cần xác minh" hoặc "không nên xóa" phải được kiểm tra trước khi thực hiện.

Runtime hiện tại được xác định là React + Vite + Supabase; Firebase chỉ dùng cho static hosting. Giữ các cấu hình Firebase nếu vẫn deploy bằng Firebase Hosting.

## 2. Mục tiêu và ranh giới

### Mục tiêu

- Loại bỏ artifact/cache sinh tự động khỏi repository.
- Loại bỏ tooling Firebase/Genkit cũ nếu không còn được project sử dụng.
- Rà soát dead code và dependency bằng static analysis kết hợp manual trace.
- Chuẩn hóa ignore rules và tài liệu dự án.
- Giữ nguyên hành vi ứng dụng, schema/migrations Supabase và các luồng nghiệp vụ.

### Không làm trong plan này

- Không merge components/ với src/components/ chỉ vì tên thư mục giống nhau.
- Không xóa lib/ vì components.json dùng alias @/lib/utils.
- Không xóa migration/compatibility code chỉ vì có chữ legacy.
- Không xóa scripts/import-legacy-master-data.mjs nếu chưa có xác nhận dữ liệu đã migrate xong.
- Không sửa schema Supabase hoặc RLS nếu task chỉ là cleanup repository.

## 3. Phase 1 - Safe cleanup artifact

### Kiểm tra trước khi xóa

- [ ] Xác nhận .firebase/ chỉ chứa hosting cache, không chứa source/config.
- [ ] Xác nhận .agents/ chỉ chứa skill bundle Firebase/Genkit/AI tooling, không có runtime/build reference.
- [ ] Xác nhận ichingproject.code-workspace là workspace cá nhân, không phải chuẩn bắt buộc của team.
- [ ] Giữ firebase.json và .firebaserc nếu Firebase Hosting vẫn là kênh deploy.

### Xử lý

- [ ] Xóa .firebase/ cache.
- [ ] Xóa .agents/ nếu kiểm tra reference không có kết quả.
- [ ] Xóa ichingproject.code-workspace nếu không dùng chung cho team.
- [ ] Nếu supabase/.temp/ đang được Git theo dõi, coi đó là CLI cache và loại khỏi repository sau khi bảo lưu thay đổi local nếu cần.
- [ ] Không xóa .vscode/ nguyên thư mục; giữ .vscode/schemas/shadcn.schema.json vì components.json tham chiếu file này.

Commit gợi ý: chore: remove generated repository artifacts

## 4. Phase 2 - Dead code và cấu trúc ứng dụng

### Tầng 1: compiler/type-check

- [ ] Chạy npm run lint.
- [ ] Audit tạm thời với noUnusedLocals và noUnusedParameters.
- [ ] Xác minh từng cảnh báo trước khi xóa; callback/event handler có thể không có caller tĩnh.

Lệnh audit tạm thời:

    npx tsc --noEmit --noUnusedLocals --noUnusedParameters

### Tầng 2: import graph

- [ ] Dùng knip hoặc công cụ tương đương để tìm unused files, exports và dependencies.
- [ ] Kiểm tra cả lazy/dynamic import, script entrypoint, test helper, Supabase callback và shadcn registry.

### Tầng 3: manual semantic audit

Phân loại candidate thành:

- [ ] Unused import.
- [ ] Unused local variable/function.
- [ ] Unused export.
- [ ] Unreachable branch.
- [ ] Unused component/module.
- [ ] Compatibility/migration code đã hết vòng đời.

Chỉ xóa nhóm cuối cùng sau khi đã trace caller/callee và kiểm tra regression.

### Tầng 4: cấu trúc thư mục

- [ ] Giữ components/ là shared UI/shadcn primitives.
- [ ] Giữ src/components/ là application components.
- [ ] Giữ lib/utils.ts vì alias shadcn đang dùng.
- [ ] Không merge/xóa hai thư mục chỉ dựa trên tên.

## 5. Phase 3 - Dependency cleanup

Tạo dependency matrix trước khi xóa:

| Package | Cách xác minh | Hành động |
|---|---|---|
| @use-gesture/react | Tìm import/require/dynamic import | Xóa nếu không có usage |
| react-use-gesture | Tìm import/require/dynamic import | Xóa nếu không có usage; package đã deprecated |
| express | Tìm server entrypoint/import | Xóa nếu app không còn Node server |
| @types/express | Phụ thuộc vào express | Xóa cùng express nếu không dùng |
| dotenv | Tìm script/runtime import | Xóa nếu không có usage trực tiếp |
| tsx | Tìm script hoặc tool entrypoint | Xóa nếu không còn script dùng |
| ajv | Tìm schema validation import | Giữ nếu canvas-file validation dùng |
| ajv-formats | Tìm format validator import | Giữ nếu đi cùng AJV |
| @mdxeditor/editor | Tìm editor component import | Giữ nếu note editor dùng |
| next-themes | Tìm useTheme/theme provider | Giữ nếu UI component dùng |
| motion | Tìm motion/* import | Giữ nếu animation dùng |
| shadcn | Tìm CSS/CLI/config usage | Giữ nếu src/index.css hoặc tooling dùng |
| @base-ui/react | Tìm shared UI imports | Giữ nếu components/ui dùng |

### Quy tắc

- [ ] Search toàn repo, loại trừ node_modules/, dist/ và binary assets khi cần.
- [ ] Không coi dependency transitive trong package-lock.json là direct usage.
- [ ] Sau mỗi nhóm xóa: npm install, npm run lint, npm test, npm run build.
- [ ] Luôn commit package-lock.json cùng package.json.

Commit gợi ý: chore: remove unused npm dependencies

## 6. Phase 4 - Repository hygiene

Bật các rule cần thiết trong .gitignore, không để comment khiến artifact quay lại:

    # Dependencies
    node_modules/

    # Builds / coverage
    dist/
    build/
    coverage/

    # Environment
    .env
    .env.*
    !.env.example

    # Runtime / tool caches
    .firebase/
    supabase/.temp/
    .vite/
    .turbo/
    .cache/
    .codebase-memory/
    .agents/
    skills-lock.json

    # Logs
    *.log
    vite-dev*.log
    npm-debug.log*
    yarn-debug.log*
    yarn-error.log*
    pnpm-debug.log*

    # OS / personal IDE files
    .DS_Store
    Thumbs.db
    .idea/
    *.code-workspace

- [ ] Không ignore toàn bộ .vscode/ nếu shared schema/config còn được dùng.
- [ ] Đồng bộ .prettierignore với các cache/artifact ở trên.
- [ ] Kiểm tra git check-ignore cho từng pattern quan trọng.

Commit gợi ý: chore: tighten repository ignores

## 7. Phase 5 - README và app-facing residue

README cần mô tả repository hiện tại, không mô tả scaffold cũ:

- [ ] Tên và mô tả ngắn của I Ching App.
- [ ] Features: I Ching/Tarot, canvas, labels, saved canvases, Supabase auth/persistence.
- [ ] Tech stack: React 19, TypeScript, Vite, Tailwind, shadcn/Base UI, Supabase, Firebase Hosting.
- [ ] Architecture: Browser -> React/Vite -> Supabase; Firebase chỉ static hosting.
- [ ] Prerequisites và environment variables.
- [ ] Install, dev, build, preview, test, lint.
- [ ] Deployment bằng firebase deploy sau npm run build.
- [ ] Data model: iching_cards_master, label_groups, labels, canvases, canvas_cards, app_cache và các bảng deck/auto-draw liên quan.
- [ ] Legacy import command và điều kiện dùng service-role key.
- [ ] Project structure.
- [ ] Security notes: không commit secrets; RLS/Auth bảo vệ dữ liệu.
- [ ] Xóa banner/link và câu chữ AI Studio.

### App-facing metadata

- [ ] Đổi title trong index.html khỏi template AI Studio.
- [ ] Xóa hoặc viết lại comment AI Studio trong vite.config.ts; giữ nguyên logic HMR.

Commit gợi ý: docs: rewrite project README

## 8. Verification checklist

### Static checks

- [ ] Không còn direct import/reference tới dependency đã xóa.
- [ ] Không còn file artifact đã xác định trong Git index.
- [ ] components.json vẫn resolve được .vscode/schemas/shadcn.schema.json.
- [ ] firebase.json và .firebaserc còn nguyên nếu Firebase Hosting được giữ.
- [ ] scripts/import-legacy-master-data.mjs và npm script còn nguyên khi lifecycle chưa được xác nhận kết thúc.

### Commands tối thiểu

    npm install
    npm run lint
    npm test
    npm run build
    git diff --check

### Acceptance criteria

- [ ] Repository không còn generated artifact/tooling cũ đã được xác minh là thừa.
- [ ] Không thay đổi business logic hoặc Supabase migrations ngoài phạm vi được phê duyệt.
- [ ] Direct dependencies phản ánh import/script usage thực tế.
- [ ] README mô tả đúng runtime/deploy hiện tại.
- [ ] Build, test và type-check pass; warning không-blocking phải được ghi nhận.

## 9. Commit sequence đề xuất

1. chore: remove generated repository artifacts
2. refactor: remove unused application files (chỉ khi manual trace xác nhận)
3. chore: remove unused npm dependencies
4. chore: tighten repository ignores
5. docs: rewrite project README

Tách commit để dễ review và rollback; không gộp thành một commit khổng lồ.

## 10. Rủi ro và quyết định cần xác nhận

- Xóa migration/importer quá sớm có thể làm mất khả năng khôi phục dữ liệu cũ.
- Xóa .vscode/ có thể phá schema reference của shadcn.
- Xóa dependency chỉ dựa trên package.json có thể làm hỏng dynamic import hoặc script entrypoint.
- npm install có thể thay đổi nhiều transitive versions; review lockfile trước khi commit.
- Nếu build cảnh báo chunk lớn nhưng exit code 0, ghi nhận là warning riêng, không tự ý đổi bundling trong cleanup.

