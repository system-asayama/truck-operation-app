# トラック運行管理アプリ TODO

## 完了済み

- [x] プロジェクト初期化（Expo SDK 54）
- [x] アプリアイコン生成・設定
- [x] カラーテーマ設定（ネイビー系）
- [x] アイコンマッピング追加（truck, route, flag等）
- [x] APIクライアント実装（lib/truck-api-client.ts）
- [x] バックグラウンドGPS追跡タスク実装（lib/background-location-task.ts）
- [x] 運行メイン画面（app/(tabs)/index.tsx）
  - [x] 運行開始（トラック選択・ルート選択）
  - [x] ステータス変更（運行中・休憩・荷積み・荷下ろし・終了）
  - [x] GPS追跡の開始・停止
  - [x] リアルタイム時計表示
- [x] 運行履歴画面（app/(tabs)/history.tsx）
  - [x] 月別履歴表示
  - [x] 運行時間計算
- [x] 設定画面（app/(tabs)/settings.tsx）
  - [x] ログイン/ログアウト
  - [x] サーバー詳細設定
  - [x] ダークモード切り替え
- [x] タブレイアウト設定（3タブ）
- [x] TypeScriptエラー修正

## 未完了

- [ ] チェックポイント保存
- [ ] GitHubへのプッシュ
