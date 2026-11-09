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
                      ├ RingBuffer（直近 8192 サンプル）→ ACF2+ または MPM
                      ├ 選択中だけ → PyinStream（pYIN）
                      ├ StreamResampler → 16 kHz → SwiftF0Stream → Worker
                      ├ StreamResampler → 16 kHz → CrepeStream → Worker
                      └ StreamResampler → 22050 Hz → BasicPitchStream → Worker
                           └ 選択中の検出器の点だけ onPoint
                                └ main.ts の points[]
                                     ├ requestAnimationFrame で PitchGraph.draw
                                     └ 同じ点と、チャンクごとの RMS → LoudnessGraph.draw
```

Worklet から `destination` まで繋がないと、ブラウザがこのグラフを処理しないことがあります。音をスピーカーへ戻さないため、間の Gain は 0 です。

マイク制約は、`autoGainControl` を端末がサポートするとき `echoCancellation: false`、`noiseSuppression: true`、`autoGainControl: true` です。サポートしないときは `{ audio: true }` です。

`AudioContext` はサンプルレートを指定せずに作ります。ACF2+、MPM、pYIN はそのレートのまま計算します。SwiftF0 と Tiny-CREPE へ渡す前に `StreamResampler` が 16 kHz へ下げ、Basic Pitch は 22050 Hz へ下げます。すでに目的のレートのときはコピーするだけです。

## 時刻

点の `time` は、マイク開始からの秒です。サンプル数を `AudioContext.sampleRate` で割った値で、`performance.now()` ではありません。

SwiftF0 のフレーム時刻は 16 kHz ストリームの先頭が 0 秒です。モデルの準備が遅れてストリームを後から作った場合、`PitchEngine` が `swiftOrigin` を足し、マイク開始からの秒に揃えます。SwiftF0 の点は公式実装どおり 176 ms 遅れて確定するので、同じ瞬間の ACF2+ より左に出ます。推論は `src/audio/swiftf0.worker.ts` の `InferenceSession` が行います。メインスレッドは音声バッファのコピーを渡し、`pitch` と `confidence` を受け取ります。点の時刻は動かしません。

Tiny-CREPE の点は、64 ms の窓の中心の時刻です。窓の後半が揃うまで 32 ms かかります。pYIN の点はフレーム時刻で、HMM が確定するまで描かれません。Basic Pitch の点は 22050 Hz ストリーム上のフレーム時刻です。最初の窓が揃うまで約 2 秒かかり、その後も窓の終端より約 0.17 秒手前までしか確定しません。いずれの遅延も、点の時刻を「今」へ動かしません。

描画の「今」は、直近チャンクの時刻と、最後の点の時刻の大きい方です。横軸は常にその「今」から 8 秒前までです。

## 検出器の選択

`PitchEngine.detector` は `"acf2"`、`"acf-basic"`、`"mpm"`、`"pyin"`、`"swiftf0"`、`"crepe"`、`"basic-mono"`、`"basic-poly"` のいずれかです。初期値は `"acf2"` です。

ACF2+、ACF2+→Basic、MPM は、選択中のときだけ 16 ms 以上間隔を空けて実行します。pYIN は選択中だけチャンクを渡します。外すとトラッカーを捨て、次に選んだときにマイクの今の時刻から作り直します。SwiftF0 はモデルの読み込みが終わるとストリームを作り、選択に関係なく 16 kHz の音声を流し続けます。推論は裏で進みますが、`onPoint` に載るのは選択中の検出器だけです。切り替えた直後から SwiftF0 の確定フレームが出るのは、この先行入力のためです。

Tiny-CREPE と Basic Pitch のリサンプルは、マイクが開いているあいだ続けます。推論するのは、その検出器が選ばれてモデルの読み込みが終わったときだけです。Basic Pitch の単音と重音は同じ推論で、結果を返すときにどちらの読み方をするかが決まります。単音はコントゥアの尾根を直前の音程から追い、有音が続く数フレームの中央値で細かい揺れを取ります。ノート頭は、尾根の近くに音があるかの判定にだけ使います。重音は半音ごとの読み方のままです。ACF2+→Basic は単音の読み方だけを使い、`onRevise` で暫定点を置き換えます。`onPoint` には ACF2+ の暫定点だけが載り、大きな音名はそちらだけを更新します。

SwiftF0 のモデル読み込みはページ表示時の `preloadModel()` で始まります。Tiny-CREPE は、そのラジオを選んだときに始まります。Basic Pitch は、単音、重音、ACF2+→Basic のいずれかを選んだときに始まります。失敗すると各モデルがエラーを覚え、同じページでは再試行しません。信号処理の検出器はそのまま使えます。ACF2+→Basic は、モデルの読み込み前も右端を ACF2+ で描きます。

停止時は MediaStream のトラックを止め、AudioContext を閉じ、SwiftF0 ストリームを `flush` します。`flush` は残り 176 ms 分のフレームも返します。Tiny-CREPE と Basic Pitch は、走っている推論の結果を捨てます。

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

`src/graph.ts` の縦軸は MIDI 30（F♯1 付近）から、少なくとも 108（C8）までです。どれかの上限が C8 を超えると、その音が収まるところまで上へ伸ばします。C の線だけ音名を左に出します。選択中の検出器の下限と上限を、その色の破線と音名で示します。下限より下と上限より上を暗くします。半音の半分を超える飛び（Basic Pitch の単音と重音、および ACF2+→Basic の確定点どうしは 0.75 半音）、50 ms を超える時間の空き、検出器の切り替わり、無音では線を切ります。ACF2+→Basic の暫定点どうし、および暫定と確定の境は、半音の半分以内なら色が変わっても 1 本の線としてつなぎます。Basic Pitch の重音は、近い音どうしを別の線としてつなぎます。範囲外の MIDI は上下の端に張り付きます。Hz 自体は点に残るので、CSV には範囲外の周波数も入ります。重音の CSV は、同じ時刻の音を 1 行ずつ書きます。

SwiftF0、pYIN、Tiny-CREPE、Basic Pitch、ACF2+→Basic を選択してマイクが動作しているあいだは、最後に確定した点から右端までを、その検出器の色のアルファ 0.12 で塗ります。ACF2+→Basic の帯だけは ACF2+ の色で、いちばん新しい Basic Pitch のフレームから右端までです。その検出器へ切り替えたあとまだ点が無いときは、切り替えた時刻から塗ります。この帯は未確定の区間であり、無音ではありません。停止中と、ACF2+ または MPM の選択中は塗りません。

`devicePixelRatio` に合わせてキャンバスの内部解像度を変えます。リサイズは `window` の `resize` だけを見ています。

その下に、横軸をピッチ、縦軸を大きさにしたグラフがあります。ピッチの範囲は時間のグラフと同じです。縦軸は -60 dBFS から 0 dBFS で、点の時刻に最も近いチャンクの RMS を `20 log10` で換算します。50 ms より離れたチャンクしか無い点と、-60 dBFS 未満は出しません。直近 8 秒の有音を点で示し、新しい点ほど濃くします。いちばん新しい時刻が 0.35 秒以内のときは、その点を大きく描きます。Basic Pitch の重音は、各音をその瞬間の入力の大きさで同じ高さに置きます。選択中の検出器の下限と上限は縦の破線で、外側は暗くなります。`main.ts` は直近約 9 秒の RMS を `points` とは別に保持します。

## ONNX Runtime の置き場所

SwiftF0、Tiny-CREPE、Basic Pitch は、それぞれ別の Worker で `onnxruntime-web` 1.21.0 の wasm ビルドを使います。実行時に次の 2 ファイルを `/ort/` から取ります。

- `ort-wasm-simd-threaded.mjs`
- `ort-wasm-simd-threaded.wasm`

この 2 つを `public/ort/` に置くと、開発サーバーが `.mjs` をソースモジュールとして変換しようとして失敗します。Vite は `public` のファイルを「HTML から参照する静的ファイル」として扱うためです。

そのため `vite.config.ts` の `ortRuntime` プラグインが次をします。

- 開発中は `node_modules/onnxruntime-web/dist` のファイルを、変換せず `/ort/` に返します。
- `buildStart` で残っている `public/ort/` を消します。
- `writeBundle` で本番の `dist/ort/` へコピーします。

セッションは Worker 内で作ります。`wasmPaths` はページ原点からの絶対 URL です。Worker の `location` はスクリプト自身を指すため、相対の `ort/` では WASM を取れません。スレッド数は 1 です。WebGPU と共有メモリ用のマルチスレッドは使いません。`session.run` の所要時間は、メインスレッドが 1 秒に 1 回まで `SwiftF0 inference … ms` とコンソールへ出します。開発サーバーと `vite preview` には、同じオリジン分離のため次のヘッダを付けています。

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

本番を別の静的サーバーへ置くときは、この 2 つを HTML、WASM、`.mjs`、モデルの応答にも付けます。付けないとランタイムの初期化に失敗することがあります。

`onnxruntime-web/wasm` の型はパッケージの export 条件だけでは解決しないため、`src/onnxruntime-web-wasm.d.ts` が `onnxruntime-common` を再公開しています。import パスを変えるときはこの宣言も合わせます。

モデル本体は `public/models/` の `swift-f0.onnx`、`crepe-tiny.onnx`、`nmp.onnx` です。`public` に置いて問題ないのは、`fetch` で読むだけで、JavaScript の `import` をしないためです。ライセンス文は同じディレクトリの `LICENSE-SWIFTF0.txt`、`LICENSE-CREPE.txt`、`LICENSE-BASIC-PITCH.txt` です。SwiftF0 を差し替えるときは、入力名 `audio` / `fmin` / `fmax` と出力名 `pitch` / `confidence` が変わっていないか確認します。Tiny-CREPE は `frames` と `probabilities`、Basic Pitch は `serving_default_input_2:0` と `StatefulPartitionedCall:1`（ノート）、`StatefulPartitionedCall:0`（コントゥア）です。

## 変更するときの入口

| やりたいこと | 触るファイル |
|---|---|
| ボタンや CSV の列 | `src/main.ts`、必要なら `index.html` |
| 線の色、見える音域、何秒分描くか | `src/graph.ts` |
| マイクの制約、16 ms の間隔 | `src/audio/engine.ts` |
| ACF2+ の式やしきい値 | `src/audio/acf2.ts` と `src/audio/acf2.test.ts` |
| ACF2+→Basic の置き換え | `src/audio/acf-basic.ts` と `src/audio/acf-basic.test.ts` |
| SwiftF0 の先読みや無音ゲート | `src/audio/swiftf0.ts` と `src/audio/swiftf0.test.ts` |
| MPM の窓と上限 | `src/audio/mpm.ts` と `src/audio/mpm.test.ts` |
| pYIN のトラッカー | `src/audio/pyin.ts` と `src/audio/pyin.test.ts` |
| Tiny-CREPE のフレームと復号 | `src/audio/crepe.ts` と `src/audio/crepe.test.ts` |
| Basic Pitch の窓と単音・重音 | `src/audio/basicpitch.ts` と `src/audio/basicpitch.test.ts` |
| モデルの入出力テンソル | `src/audio/swiftf0.worker.ts`、`crepe.worker.ts`、`basicpitch.worker.ts` |
| Worker との送受信 | `src/audio/swiftf0-session.ts`、`crepe-session.ts`、`basicpitch-session.ts` |
| 16 kHz または 22050 Hz への変換 | `src/audio/resample.ts` |
| 音名と MIDI の式 | `src/audio/notes.ts` |
| WASM の配信パス | `vite.config.ts` と各 `*.worker.ts` の `wasmPaths` |

Worklet は Vite のモジュールではなく `public/capture-worklet.js` です。`AudioWorkletGlobalScope` で動き、DOM や `src/` の import は使えません。ブロック長を変えるときは、メイン側が任意長の `Float32Array` を受け取れることを確認します。今の `onChunk` は長さを固定していません。
