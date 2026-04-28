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
- [x] theme-provider の console.log 削除（publish 準備）
- [x] icon-symbol に arrow.down.circle.fill マッピング追加
- [x] design.md 作成
- [x] todo.md 更新

## 未完了

- [ ] チェックポイント保存
- [ ] GitHubへのプッシュ

## 写真撮影・コメント機能
- [ ] サーバー側: truck_operation_photosテーブル追加（DBマイグレーション）
- [ ] サーバー側: /api/mobile/photo/upload エンドポイント追加（multipart/form-data）
- [ ] サーバー側: /api/mobile/photo/list エンドポイント追加（operation_id別一覧）
- [ ] アプリ側: expo-cameraをapp.config.tsに追加（パーミッション設定）
- [ ] アプリ側: icon-symbol.tsxにphoto関連アイコン追加
- [ ] アプリ側: components/photo-capture-modal.tsx 作成（カメラ撮影・コメント入力・アップロード）
- [ ] アプリ側: lib/truck-api-client.tsにuploadPhoto/getPhotos関数追加
- [ ] アプリ側: 運行画面（index.tsx）に「写真撮影」ボタン追加（運行中のみ表示）
- [ ] アプリ側: 運行画面に撮影済み写真のサムネイル一覧表示
