<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 메추리 팀 규칙
- 작업 전 plan.md를 읽고 테이블·열·함수 이름을 그대로 따른다
- plan.md §10에서 요청자 담당이 아닌 파일은 수정하지 않는다
- 테이블 구조를 바꾸는 코드는 plan.md 수정 없이 만들지 않는다
- secret 키를 코드나 NEXT_PUBLIC_ 변수에 넣지 않는다
