# Claude Code Task: 日本語・Excel形式 基本設計書 作成

## 0. Objective

Create a **Japanese basic design document in Excel format** for this project by analyzing BOTH:

1. the original requirement/source documents, especially `docs/source/AIを実装した人材採用マッチングシステム開発_仕様説明.docx` or an equivalent source file in the repository; and
2. the current implemented repository, including frontend routes/pages, backend routes/services, shared schemas, database migrations, RLS and Storage policies, AI/embedding adapters, localization files, tests, E2E specs, deployment/configuration files, and existing documentation.

The final deliverable must be a real `.xlsx` workbook, not Markdown tables copied into a text file.

Write the workbook in formal Japanese using consistent **である調**.

## 1. Non-negotiable rules

### 1.1 Documentation-only task

Do not change application behavior.

Allowed changes:

- `docs/design/basic/AI人材採用マッチングシステム_基本設計書.xlsx`
- `docs/design/basic/EXCEL_DOCUMENT_VERIFICATION_JA.md`
- optionally `docs/design/basic/BASIC_DESIGN_EXCEL_README_JA.md`
- optionally one temporary or committed documentation-generation helper under `scripts/docs/`, only if it is necessary to generate the workbook reproducibly

Forbidden changes:

- application source files under `apps/`, `packages/`, `src/`, or equivalent runtime directories
- tests, fixtures, mocks, migrations, RLS/Storage policies
- dependency manifests or lockfiles: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, etc.
- CI/deploy configuration
- runtime environment files

If a helper script requires a library, use an already available local tool where possible. If no workbook writer is available, use a temporary local environment outside committed source and remove it before finishing. Do not commit dependency changes.

### 1.2 No invention

Do not describe unimplemented behavior as implemented.

When requirements and implementation differ, classify explicitly as one of:

- `一致`
- `要求のみ（未実装）`
- `実装のみ（要求書未記載）`
- `部分実装`
- `仕様差異`
- `確認不能`

Every major row must include evidence paths, such as:

- requirement evidence path, for example `docs/source/...docx#section-or-heading`
- implementation evidence path, for example `apps/api/src/routes/auth.ts`, `apps/web/src/pages/Login.tsx`, `supabase/migrations/0009_rls.sql`
- test evidence path, for example `apps/api/test/auth.integration.test.ts`, `apps/web/e2e/journeys.spec.ts`

If exact docx line numbers are unavailable, cite the closest section title or paragraph summary.

### 1.3 Preserve FR-01 through FR-10 semantics

The design workbook must cover all current project functionality without changing it:

- FR-01 認証・ユーザー管理
- FR-02 履歴書アップロード・解析
- FR-03 AIスキル分析
- FR-04 企業・求人管理
- FR-05 AIマッチング
- FR-06 人材検索・候補者詳細
- FR-07 企業・求人検索
- FR-08 メッセージ・通知
- FR-09 多言語対応（ja/en/zh-CN/zh-TW）
- FR-10 候補者比較・面接・採用フロー

## 2. Required Excel workbook

Create:

```text
docs/design/basic/AI人材採用マッチングシステム_基本設計書.xlsx
```

Workbook requirements:

- Each sheet must have a clear Japanese title, freeze pane, autofilter/table-like structure, wrapped text, readable widths, and consistent styling.
- Use one row per screen/API/table/field/rule/trace item where appropriate.
- Avoid huge paragraph-only sheets. Excel must be useful for review, filtering, and issue tracking.
- Include status/category columns with consistent values.
- Include evidence columns for source requirement, implementation, and tests.
- Include a `最終確認` or `備考` column for reviewer notes where useful.

## 3. Required sheets and columns

Create at least the following sheets. Sheet names may be shortened to meet Excel limits, but must remain understandable.

### 00_表紙

Columns or structured fields:

- 文書名
- 対象システム
- 対象リポジトリ
- 作成日
- 作成者
- 対象バージョン / Git branch / Git commit
- 文書目的
- 対象範囲
- 前提・制約

### 01_改訂履歴

Columns:

- 版数
- 日付
- 変更区分
- 変更内容
- 作成者
- レビュー状態

### 02_凡例_文書構成

Columns:

- 項目
- 説明
- 使用シート
- ステータス定義
- 備考

Must define the discrepancy classification values.

### 03_システム概要

Columns:

- 区分
- 設計内容
- 要件根拠
- 実装根拠
- 補足

Must cover overview, target users, roles, high-level architecture, frontend/backend/database/AI/storage boundaries.

### 04_機能一覧

Columns:

- 機能ID
- 機能名
- 概要
- 対象ロール
- 主要画面
- 主要API
- 主要DB
- 実装状態
- 要件根拠
- 実装根拠
- テスト根拠
- 備考

Must map FR-01 through FR-10.

### 05_業務フロー

Columns:

- フローID
- フロー名
- アクター
- 開始条件
- ステップ番号
- ユーザー操作 / システム処理
- 主な画面
- 主なAPI
- 成功条件
- 例外・分岐
- 証跡

Must include seeker flow and company/recruiter flow.

### 06_画面一覧

Columns:

- 画面ID
- 画面名
- URL / Route
- 対象ロール
- 概要
- 主要機能
- 主要API
- 多言語キー / i18n根拠
- 権限制御
- 状態（Loading/Empty/Error）
- 実装根拠
- テスト根拠

### 07_画面項目定義

Columns:

- 画面ID
- 項目ID
- 項目名
- 表示/入力
- データ型
- 必須
- 入力制約
- バリデーション
- 表示条件
- 保存先 / API項目
- エラーメッセージ
- 実装根拠

### 08_API一覧

Columns:

- API ID
- Method
- Path
- 概要
- 認証要否
- 許可ロール
- Request Schema
- Response Schema
- 主なDB操作
- RLS影響
- エラーコード
- 実装根拠
- テスト根拠

### 09_API詳細

Columns:

- API ID
- 区分
- 項目名
- 型
- 必須
- 制約
- 説明
- 正常時
- 異常時
- 備考

Use multiple rows per API for request fields, response fields, errors, and side effects.

### 10_DBテーブル一覧

Columns:

- テーブル名
- 概要
- 主キー
- 主要外部キー
- 主な利用機能
- RLS有無
- 主要インデックス
- pgvector有無
- 実装根拠
- 備考

### 11_DB項目定義

Columns:

- テーブル名
- カラム名
- データ型
- Null可否
- デフォルト
- 主キー
- 外部キー
- Unique
- Check制約
- 個人情報区分
- 説明
- 実装根拠

### 12_ERD_RLS概要

Columns:

- 領域
- エンティティ / 関係
- From
- To
- 関係種別
- 多重度
- 説明
- RLS観点
- 実装根拠

If an actual diagram can be embedded safely, include it. If not, the relationship table is acceptable.

### 13_RLS権限マトリクス

Columns:

- テーブル / Storage
- 操作（SELECT/INSERT/UPDATE/DELETE/DOWNLOAD等）
- anonymous
- seeker
- company_member
- admin/system
- 条件
- テナント分離ルール
- IDOR対策
- 実装根拠
- テスト根拠

### 14_AI_マッチング設計

Columns:

- 設計項目
- 処理種別
- 入力
- 出力
- Provider / Adapter
- Deterministic mock
- Prompt/Schema対策
- Embedding
- Score / Algorithm
- Failure handling
- 実装根拠
- テスト根拠

Must cover LLM, embedding, pgvector, score explanation, deterministic mocks, retry/schema validation, prompt-injection considerations.

### 15_バッチ_ジョブ設計

Columns:

- ジョブID
- ジョブ名
- 起動契機
- 入力
- 処理内容
- 冪等性
- Retry/Timeout
- Dead-letter / Failure handling
- 監視
- 実装状態
- 実装根拠
- 備考

If the implementation is synchronous or mock/local, classify accurately; do not invent a queue.

### 16_多言語設計

Columns:

- Locale
- 対象範囲
- i18n実装方式
- 主な辞書ファイル
- APIエラー対応
- 未翻訳検知
- テスト根拠
- 備考

Must cover `ja`, `en`, `zh-CN`, `zh-TW`.

### 17_非機能_運用設計

Columns:

- 分類
- 設計項目
- 要求内容
- 現行実装
- 評価
- 証跡
- リスク
- 改善案

Cover security, privacy, audit, logging, observability, performance, accessibility, deployment, backup, migration, rate limiting, file upload, virus scan.

### 18_テスト設計

Columns:

- テスト分類
- 対象機能
- テスト観点
- テストファイル
- 主なケース
- 件数
- 実行コマンド
- 結果
- 備考

### 19_トレーサビリティ

Columns:

- 要件ID
- 要件概要
- 設計シート
- 画面ID
- API ID
- DB / RLS
- テスト
- 実装状態
- 差異分類
- 証跡
- 備考

This is the most important sheet. Every FR-01 through FR-10 item must appear.

### 20_差異_未決事項

Columns:

- No.
- 区分
- 差異分類
- 内容
- 要件側
- 実装側
- 業務影響
- 技術影響
- 推奨対応
- 優先度
- 確認先
- 証跡

### 21_証跡

Columns:

- 証跡ID
- 種別
- パス
- 内容要約
- 関連シート
- 確認結果
- 備考

Must inventory inspected source documents, code directories, route files, migrations, RLS policies, i18n catalogs, tests, and existing docs.

## 4. Generation process

1. Inspect the source requirement documents and summarize source headings/requirements.
2. Inspect current repo structure.
3. Inventory frontend routes/pages.
4. Inventory backend routes/services/schemas.
5. Inventory database migrations, RLS policies, Storage policies, indexes, pgvector usage.
6. Inventory AI/embedding adapters and deterministic local mocks.
7. Inventory i18n catalogs and tests.
8. Inventory automated tests and E2E flows.
9. Build a structured intermediate inventory in memory or temporary files.
10. Generate the Excel workbook.
11. Re-open or inspect the workbook to ensure all required sheets exist and are populated.
12. Run verification commands.
13. Write `docs/design/basic/EXCEL_DOCUMENT_VERIFICATION_JA.md`.

## 5. Required verification

Before final response, run and record:

```bash
git status --short
git diff --check
find docs/design/basic -maxdepth 1 -type f -print
```

Also verify the workbook exists and is a valid `.xlsx`. Use any available local method, for example Python/openpyxl, LibreOffice headless, Node XLSX library, or file/zip inspection. Record:

- workbook path
- file size
- sheet count
- sheet names
- row counts per sheet
- verification command(s)
- exit codes

Do not run application tests unless you changed forbidden areas. If any forbidden file changed, revert it and explain in the verification file.

## 6. Final response format

The final response must include:

- path to the Excel workbook
- sheet count and main sheet list
- confirmation that source requirements and code were both inspected
- confirmation that no runtime files were changed
- verification command summary
- discrepancy summary
- final line exactly:

```text
FINAL_STATUS: COMPLETE
```

Do not output `FINAL_STATUS: COMPLETE` until all required sheets exist, the workbook is valid, verification is recorded, and no forbidden source/runtime changes remain.
