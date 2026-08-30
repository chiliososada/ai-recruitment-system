# Excel形式・日本語基本設計書 生成プロンプトの使い方

このパックは、既存コードと元要求資料を読み込ませて、Excel形式の日本語基本設計書を Claude Code に生成させるためのものです。

## 1. 配置

以下のように、プロジェクト直下にコピーしてください。

```text
your-project/
├── docs/
│   └── source/
│       └── AIを実装した人材採用マッチングシステム開発_仕様説明.docx
├── CLAUDE_CODE_BASIC_DESIGN_EXCEL_TASK.md
├── CLAUDE_CODE_BASIC_DESIGN_EXCEL_GOAL.txt
├── apps/
├── packages/
└── package.json
```

必要であれば `BasicDesignExcel_Template.xlsx` も参考テンプレートとして `docs/design/basic/` に置いてください。ただし Claude Code には最終成果物として新しい `.xlsx` を生成させる想定です。

## 2. 文書専用ブランチを作成

```bash
cd /path/to/your-project
git status --short
git switch -c docs/basic-design-excel-ja
```

## 3. Claude Code を起動

```bash
claude
```

起動後、`CLAUDE_CODE_BASIC_DESIGN_EXCEL_GOAL.txt` の1行をそのまま貼り付けます。

## 4. 生成される成果物

```text
docs/design/basic/AI人材採用マッチングシステム_基本設計書.xlsx
docs/design/basic/EXCEL_DOCUMENT_VERIFICATION_JA.md
```

Excelには少なくとも以下のシートが生成されます。

```text
00_表紙
01_改訂履歴
02_凡例_文書構成
03_システム概要
04_機能一覧
05_業務フロー
06_画面一覧
07_画面項目定義
08_API一覧
09_API詳細
10_DBテーブル一覧
11_DB項目定義
12_ERD_RLS概要
13_RLS権限マトリクス
14_AI_マッチング設計
15_バッチ_ジョブ設計
16_多言語設計
17_非機能_運用設計
18_テスト設計
19_トレーサビリティ
20_差異_未決事項
21_証跡
```

## 5. 完了後の確認

```bash
git status --short
git diff --check
find docs/design/basic -maxdepth 1 -type f -print
```

`git status --short` で runtime source、tests、migrations、package.json、lockfile が変更されていたら、Claude Code に修正させてください。

最終応答が以下で終われば完了です。

```text
FINAL_STATUS: COMPLETE
```
