# プロジェクト固有レビュー基準（Project-Specific Review Criteria）

※本ファイルの内容が `docs/review/common-criteria.md` と競合する場合は、**本ファイルを優先する**。

このリポジトリはブラウザだけで動く音程レコーダーである。TypeScript、React、Vite で、サーバーもデータベースも無い。コマンドは `docs/development.md` に従い、mise を通す。ESLint、Prettier、Biome の設定と npm script は無い。

## 1. 必須チェックコマンド

子 worktree のルートで、親が自分で実行し、終了コードをレポートに残す。実装した子の報告だけでは足りない。

| 条件 | コマンド |
|---|---|
| 振る舞いを変えたとき。毎回 | `mise exec -- npm test` |
| `src` の型、import、公開面を変えたとき | `mise exec -- npx tsc --noEmit` |
| 画面の配信物、`vite.config.ts`、静的ファイルの置き場所を変えたとき | `mise exec -- npm run build` |
| `src/**/*.stories.tsx` または `.storybook/` を変えたとき | `mise exec -- npm run build-storybook` |

`npm run build` は `tsc --noEmit` のあとに `vite build` を実行する。`tsconfig.json` は `src/**/*.stories.tsx` を型チェックから外している。ストーリーの型は `build-storybook` で見る。

`pnpm install` や、mise を通さない `npm` / `npx` は使わない。ロックは `package-lock.json` である。

## 2. ディレクトリ構成・設計規約

画面は Feature-Sliced Design である。上の層が下の層を import する。`shared` は `features` を知らず、`src/audio` は画面を知らない。

| 層 | 場所 | 役割 |
|---|---|---|
| app | `src/app` | React の起点と Tailwind の `@theme` |
| pages | `src/pages/recorder` | ヘッダー、ステージ、録音一覧、フッターの組み立て |
| widgets | `src/widgets` | ヘッダー、フッター、ステージ、設定ダイアログ、録音一覧 |
| features | `src/features` | 一つの操作。見た目と、セッションへの接続を分ける |
| entities | `src/entities` | セッション、録音ファイル、ピッチの計算と描画 |
| shared | `src/shared` | ボタン、ダイアログ、Switch、Input、`cn` |
| audio | `src/audio` | 検出器、符号化、Worker。画面を知らない |

UI の import は `@/` とし、`tsconfig.json` と `vite.config.ts` が `src/` へ向ける。`src/entities/session/model/session.ts` と `src/audio` は相対パスのままにする。`session.ts` を再 export する `index.ts` は置かない。このモジュールを値として読むと `PitchEngine` が作られ、設定の復元と SwiftF0 の先読みが走る。

操作は、値とコールバックだけを受ける部品と、`useSessionSlice` と `set*` を渡す接続側に分ける。Storybook は見た目の側だけを `src/**/*.stories.tsx` に置く。ストーリーは `session.ts` を値として import しない。

`src/shared/ui` は Button、IconButton、Dialog、Switch、Input、Label を手で書いてある。色は `src/app/styles/index.css` の `@theme` である。`components.json` は置き場所を示すだけで、shadcn の CLI で部品を足さない。

検出器の式を変えるときは、同じ名前の `src/audio/*.test.ts` を一緒に見る。画面の入口は `docs/architecture.md` の「変更するときの入口」に従う。

## 3. 技術スタック固有の注意点・禁止事項

- `tsconfig.json` は `strict: true` である。`any` や非 null 断言でエラーを消さない。
- ピッチの点、チャンクの RMS、追従の窓は React の state にも props にも載せない。`Stage` はキャンバスを `mountStage` に渡し、描画は `requestAnimationFrame` のままにする。キャンバスの幅と高さは React から設定せず、`ResizeObserver` に任せる。
- ヘッダーの音量メーターは `bindMeter` が DOM を直接動かす。点の購読でメーターを描き直さない。
- 設定の保存は `src/entities/session/model/preferences.ts` である。範囲外の保存値は読み飛ばし、その項目だけ初期値に戻す。録音の選択や、マイクが開いているかは残さない。
- 録音の音声は IndexedDB `pitch-recorder` の `files` と `blobs` だけに置く。サーバーへ送らない。ピッチの点も送らない。
- `public/ort/` をコミットしない。`onnxruntime-web` は 1.21.0 の wasm ビルドで、開発中は `vite.config.ts` の `ortRuntime` が `/ort/` へ返す。本番の配信には `Cross-Origin-Opener-Policy: same-origin` と `Cross-Origin-Embedder-Policy: require-corp` が要る。
- モデル本体は `public/models/` の `swift-f0.onnx`、`crepe-tiny.onnx`、`nmp.onnx` である。入出力名を変えるときは、対応する `*.worker.ts` とライセンス文を一緒に見る。
- Worklet は `public/capture-worklet.js` である。DOM や `src/` の import は使えない。
- SwiftF0 の推論時間をメインスレッドが 1 秒に 1 回までコンソールへ出す既存のログを、新しいデバッグログの先例にしない。変更で足した `console.log` は残さない。
- 音声も推定結果もこのブラウザの外へ出さない。ログイン、アップロード、MIDI ファイルの書き出しは、Issue が明示しない限り足さない。

## 4. データ・API・環境変数の変更ルール

データベース、サーバー API、`.env` は無い。新しい永続化を足す変更は、Issue が明示していない限り Must として差し戻す。

ブラウザ内の保存を変えるときは次を守る。

- 設定は `localStorage` の `pitch-recorder-settings` だけである。キーを増やすときは、壊れた値や範囲外の値を捨て、他の項目は残す。
- 録音は IndexedDB `pitch-recorder` の `files` と `blobs` だけである。一覧表示のために `blobs` まで読まない。
- CSV の列は `time_s,detector,pitch_hz,midi,note,confidence,voiced` である。列を変えるときは、Issue の受け入れ条件と既存のダウンロードを突き合わせる。
- 基準音 A4 の入力は 415〜466 Hz だけを受ける。音程の固定範囲に保存するのは MIDI 番号 0〜127 である。

## 5. ドメイン固有ルール（人間による追記用）

- （現時点では未設定。必要に応じて人間が追記する）
