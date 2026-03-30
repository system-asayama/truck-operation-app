# トラック運行管理アプリ

Expo（React Native）製のトラックドライバー向け運行管理モバイルアプリです。

## 概要

このアプリは、`client-management-app-original` のモバイルAPI（`/api/mobile`）と連携し、トラックドライバーの運行管理・GPS位置追跡を行います。

## 主な機能

### 運行管理
- **出発・帰着打刻**: ドライバーが出発・帰着時刻を記録
- **休憩管理**: 休憩開始・終了の記録と休憩時間の自動計算
- **稼働時間表示**: リアルタイムの稼働時間計算

### GPS追跡
- **フォアグラウンド追跡**: アプリ起動中の定期的なGPS位置送信
- **バックグラウンド追跡**: アプリをバックグラウンドにしても継続的に位置情報を送信
- **リアルタイムモード**: 管理者がリアルタイム追跡をONにすると4秒間隔で送信
- **手動送信**: 任意のタイミングで現在位置を送信

### 履歴確認
- 本日のGPS記録一覧の表示
- バックグラウンド取得の識別表示

## 画面構成

| 画面 | 説明 |
|------|------|
| ログイン | サーバーURL・テナントスラッグ・ログインIDでログイン |
| ホーム | 現在時刻・運行状態・クイックアクション |
| 運行管理 | タイムライン・稼働時間・詳細操作 |
| GPS履歴 | 本日のGPS記録一覧 |
| 設定 | アカウント情報・GPS設定・ログアウト |

## セットアップ

### 前提条件

- Node.js 18以上
- Expo CLI
- iOS/Androidデバイスまたはエミュレーター

### インストール

```bash
npm install
```

### 起動

```bash
# 開発サーバー起動
npx expo start

# Android
npx expo start --android

# iOS
npx expo start --ios
```

### ビルド（EAS Build）

```bash
# EAS CLIのインストール
npm install -g eas-cli

# ログイン
eas login

# ビルド設定
eas build:configure

# Androidビルド
eas build --platform android

# iOSビルド
eas build --platform ios
```

## API連携

このアプリは `client-management-app-original` の以下のAPIエンドポイントを使用します：

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/api/mobile/auth/login` | POST | ログイン認証 |
| `/api/mobile/attendance/today` | GET | 本日の勤怠取得 |
| `/api/mobile/attendance/clock_in` | POST | 出発打刻 |
| `/api/mobile/attendance/clock_out` | POST | 帰着打刻 |
| `/api/mobile/attendance/break_start` | POST | 休憩開始 |
| `/api/mobile/attendance/break_end` | POST | 休憩終了 |
| `/api/mobile/location/record` | POST | GPS位置記録 |
| `/api/mobile/location/today` | GET | 本日のGPS履歴 |
| `/api/mobile/location/realtime_mode` | GET | リアルタイムモード確認 |

### 認証ヘッダー

```
X-Mobile-API-Key: {MOBILE_API_KEY}
X-Staff-Token: {staff_token}
```

## ディレクトリ構造

```
truck-operation-app/
├── App.tsx                    # エントリーポイント
├── app.json                   # Expo設定
├── package.json               # 依存関係
├── src/
│   ├── screens/               # 画面コンポーネント
│   │   ├── LoginScreen.tsx    # ログイン画面
│   │   ├── HomeScreen.tsx     # ホーム画面
│   │   ├── OperationScreen.tsx # 運行管理画面
│   │   ├── HistoryScreen.tsx  # GPS履歴画面
│   │   └── SettingsScreen.tsx # 設定画面
│   ├── navigation/
│   │   └── AppNavigator.tsx   # ナビゲーション設定
│   ├── hooks/
│   │   ├── useAuth.ts         # 認証フック
│   │   └── useGpsTracking.ts  # GPS追跡フック
│   ├── services/
│   │   └── api.ts             # API通信サービス
│   └── types/
│       └── index.ts           # 型定義
└── assets/                    # 画像アセット
```

## 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Expo | ~54.0.33 | モバイルアプリフレームワーク |
| React Native | 0.81.5 | UIフレームワーク |
| TypeScript | ~5.9.2 | 型安全な開発 |
| expo-location | ~18.1.5 | GPS位置情報取得 |
| expo-task-manager | ~12.0.6 | バックグラウンドタスク管理 |
| @react-navigation | ^7.x | 画面ナビゲーション |
| AsyncStorage | 2.1.2 | ローカルデータ永続化 |

## 関連リポジトリ

- [client-management-app-original](https://github.com/system-asayama/client-management-app-original) - バックエンドAPIサーバー

## ライセンス

MIT License

---

最終更新: 2026-03-31
