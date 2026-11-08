# 構成

[README](README.md) の起動ができることを前提に、音が入ってから線になるまでを説明します。検出式そのものは [detectors.md](detectors.md) です。

## データの流れ

```text
マイク
  └ getUserMedia
       └ AudioContext（端末の標準レート）
            └ MediaStreamSource
                 └ AudioWorklet「capture」（512 サンプルごとに転送）
                      └ Gain 0 → destination
                 └ PitchEngine.onChunk
                      ├ RingBuffer（直近 8192 サンプル）→ ACF2+
                      └ StreamResampler → 16 kHz → SwiftF0Stream → ONNX
                           └ 選択中の検出器の点だけ onPoint
                                └ main.ts の points[]
                                     └ requestAnimationFrame で PitchGraph.draw
```

Worklet から `destination` まで繋がないと、ブラウザがこのグラフを処理しないことがあります。音をスピーカーへ戻さないため、間の Gain は 0 です。

マイク制約は、`autoGainControl` を端末がサポートするとき `echoCancellation: false`、`noiseSuppression: true`、`autoGainControl: true` です。サポートしないときは `{ audio: true }` です。

`AudioContext` はサンプルレートを指定せずに作ります。ACF2+ はそのレートのまま計算します。SwiftF0 へ渡す前に `StreamResampler` が 16 kHz へ下げます。すでに 16 kHz のときはコピーするだけです。

## 時刻

点の `time` は、マイク開始からの秒です。サンプル数を `AudioContext.sampleRate` で割った値で、`performance.now()` ではありません。

SwiftF0 のフレーム時刻は 16 kHz ストリームの先頭が 0 秒です。モデルの準備が遅れてストリームを後から作った場合、`PitchEngine` が `swiftOrigin` を足し、マイク開始からの秒に揃えます。SwiftF0 の点は公式実装どおり 176 ms 遅れて確定するので、同じ瞬間の ACF2+ より左に出ます。

描画の「今」は、直近チャンクの時刻と、最後の点の時刻の大きい方です。横軸は常にその「今」から 8 秒前までです。

## 検出器の選択

`PitchEngine.detector` は `"acf2"` か `"swiftf0"` です。初期値は `"acf2"` です。

ACF2+ は、選択中のときだけ 16 ms 以上間隔を空けて実行します。SwiftF0 はモデルの読み込みが終わるとストリームを作り、選択に関係なく 16 kHz の音声を流し続けます。推論は裏で進みますが、`onPoint` に載るのは選択中の検出器だけです。切り替えた直後から SwiftF0 の確定フレームが出るのは、この先行入力のためです。

モデルの読み込みはページ表示時の `preloadModel()` で始まります。失敗すると `modelError` を覚え、同じページでは再試行しません。ACF2+ はそのまま使えます。

停止時は MediaStream のトラックを止め、AudioContext を閉じ、SwiftF0 ストリームを `flush` します。`flush` は残り 176 ms 分のフレームも返します。

## 画面が持っている状態

`src/main.ts` が次を持ちます。

| 状態 | 場所 | 意味 |
|---|---|---|
| `points` | `main.ts` | 描画と CSV の元。エンジンは保持しません |
| `clock` | `main.ts` | 最新の音声時刻 |
| `a4` | `main.ts` と `PitchGraph` | 基準周波数。エンジンの Hz は変えません |
| `running` | `PitchEngine` | マイクが開いているか |

点は 20 万件を超えると、古い方から削って 18 万件にします。消去ボタンは配列を空にするだけで、エンジンのサンプルカウンタは戻しません。停止して再開しても `samples` は続きます。リングバッファだけ新しいものに替えます。

## グラフ

`src/graph.ts` の縦軸は MIDI 30（F♯1 付近）から 108（C8）です。C の線だけ音名を左に出します。1 半音を超える飛び、50 ms を超える時間の空き、検出器の切り替わりでは線を切ります。範囲外の MIDI は上下の端に張り付きます。Hz 自体は点に残るので、CSV には範囲外の周波数も入ります。

`devicePixelRatio` に合わせてキャンバスの内部解像度を変えます。リサイズは `window` の `resize` だけを見ています。

## ONNX Runtime の置き場所

SwiftF0 は `onnxruntime-web` 1.21.0 の wasm ビルドを使います。実行時に次の 2 ファイルを `/ort/` から取ります。

- `ort-wasm-simd-threaded.mjs`
- `ort-wasm-simd-threaded.wasm`

この 2 つを `public/ort/` に置くと、開発サーバーが `.mjs` をソースモジュールとして変換しようとして失敗します。Vite は `public` のファイルを「HTML から参照する静的ファイル」として扱うためです。

そのため `vite.config.ts` の `ortRuntime` プラグインが次をします。

- 開発中は `node_modules/onnxruntime-web/dist` のファイルを、変換せず `/ort/` に返します。
- `buildStart` で残っている `public/ort/` を消します。
- `writeBundle` で本番の `dist/ort/` へコピーします。

`src/audio/swiftf0-session.ts` はスレッド数を 1 に固定しています。共有メモリ用のマルチスレッドは使いません。開発サーバーと `vite preview` には、同じオリジン分離のため次のヘッダを付けています。

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

本番を別の静的サーバーへ置くときは、この 2 つを HTML、WASM、`.mjs`、モデルの応答にも付けます。付けないとランタイムの初期化に失敗することがあります。

`onnxruntime-web/wasm` の型はパッケージの export 条件だけでは解決しないため、`src/onnxruntime-web-wasm.d.ts` が `onnxruntime-common` を再公開しています。import パスを変えるときはこの宣言も合わせます。

モデル本体は `public/models/swift-f0.onnx` です。`public` に置いて問題ないのは、`fetch` で読むだけで、JavaScript の `import` をしないためです。ライセンス文は同じディレクトリの `LICENSE-SWIFTF0.txt` です。モデルを差し替えるときは、入力名 `audio` / `fmin` / `fmax` と出力名 `pitch` / `confidence` が変わっていないか確認します。

## 変更するときの入口

| やりたいこと | 触るファイル |
|---|---|
| ボタンや CSV の列 | `src/main.ts`、必要なら `index.html` |
| 線の色、見える音域、何秒分描くか | `src/graph.ts` |
| マイクの制約、16 ms の間隔 | `src/audio/engine.ts` |
| ACF2+ の式やしきい値 | `src/audio/acf2.ts` と `src/audio/acf2.test.ts` |
| SwiftF0 の先読みや無音ゲート | `src/audio/swiftf0.ts` と `src/audio/swiftf0.test.ts` |
| モデルの入出力テンソル | `src/audio/swiftf0-session.ts` |
| 16 kHz への変換 | `src/audio/resample.ts` |
| 音名と MIDI の式 | `src/audio/notes.ts` |
| WASM の配信パス | `vite.config.ts` と `swiftf0-session.ts` の `wasmPaths` |

Worklet は Vite のモジュールではなく `public/capture-worklet.js` です。`AudioWorkletGlobalScope` で動き、DOM や `src/` の import は使えません。ブロック長を変えるときは、メイン側が任意長の `Float32Array` を受け取れることを確認します。今の `onChunk` は長さを固定していません。
