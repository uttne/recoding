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
                      ├ 録音中だけ、チャンクのコピーを録音バッファへ
                      ├ RingBuffer（直近 8192 サンプル）→ ACF2+ または MPM
                      ├ 選択中だけ → PyinStream（pYIN）
                      ├ StreamResampler → 16 kHz → SwiftF0Stream → Worker
                      ├ StreamResampler → 16 kHz → CrepeStream → Worker
                      └ StreamResampler → 22050 Hz → BasicPitchStream → Worker
                           └ 選択中の検出器の点だけ onPoint
                                └ entities/session/model/session.ts の points[]
                                     ├ requestAnimationFrame で PitchGraph.draw
                                     ├ 同じ点と、チャンクごとの RMS → LoudnessGraph.draw
                                     └ 同じ点と RMS → RibbonGraph.draw

録音を停止
  └ 録音バッファを 16 bit PCM の WAV にする
       └ IndexedDB
            ├ files … 名前、時刻、サンプルレート、フレーム数
            └ blobs … WAV のバイト列

保存した録音の再生
  └ blobs の WAV を Float32 に戻す
       └ AudioBufferSource → destination（聞こえる）
            └ 同じ AudioWorklet「capture」→ Gain 0 → destination
                 └ PitchEngine.onChunk（上と同じ検出）
```

Worklet から `destination` まで繋がないと、ブラウザがこのグラフを処理しないことがあります。マイクのときは音をスピーカーへ戻さないため、間の Gain は 0 です。保存した録音を再生するときは、同じ Worklet に加えて `destination` へ直接繋ぎ、音が聞こえます。

「録音を停止」を押すと、`onChunk` が溜めたコピーを 16 bit に量子化し、WAV として IndexedDB へ書きます。マイクを聞いているだけではバッファは空です。`idb` で開くデータベース名は `pitch-recorder` です。`files` が目録、`blobs` がファイル本体です。再生は WAV を Float32 に戻して `AudioBufferSource` で鳴らし、解析用のサンプルクロックは 0 からやり直しです。前のセッションの推論が遅れて返っても、セッションを始めるときに進めた印と違うものは捨てます。マイクを止めた直後の SwiftF0 の `flush` は、次のセッションが始まる前ならそのまま点になります。

ダウンロードの WAV は、保存してあるバイト列をそのまま返します。FLAC は libflacjs の wasm ビルドです。`vite.config.ts` がその wasm の URL をエンコーダへ渡すので、Worker は隣のファイル名を探しません。MP3 は @breezystack/lamejs です。どちらも `encode.worker.ts` が符号化します。Worker を起動できないときだけ、同じ符号化をメインスレッドでやり直します。MP3 は 192 kbps です。LAME が受け取れないサンプルレートのときだけ、符号化の前に 48 kHz へ変換します。

画面の設定は `localStorage` の `pitch-recorder-settings` です。検出器、マイク、A4、上限、色分け、未確定の区間、音域のガイド、表示、スケール、音程の範囲、ダウンロード形式を、変更のたびに書き、起動時に読みます。壊れた項目は捨てて、その項目だけ初期値を使います。録音の選択や、マイクが開いているかどうかは残しません。

設定のマイク一覧は `enumerateDevices` の音声入力です。未選択はブラウザの既定です。選んだ `deviceId` は取り込み制約に exact で入れ、その機器が無いときは既定の入力へ戻します。名称はマイクの使用を許可するまで空のことがあり、その間は「マイク 1」のように出します。マイク制約は、ブラウザが対応しているエコーキャンセル、ノイズ抑制、自動ゲインをすべてオフにします。オフにできないときは、その制約なしで開き直します。表示する dB は、こうして届いた波形の RMS を `20 log10` した値で、サンプルが振り切れる大きさが 0 dBFS です。OS のマイク効果がブラウザの手前でかかっている場合、この制約では外れません。

`AudioContext` はサンプルレートを指定せずに作ります。ACF2+、MPM、pYIN はそのレートのまま計算します。SwiftF0 と Tiny-CREPE へ渡す前に `StreamResampler` が 16 kHz へ下げ、Basic Pitch は 22050 Hz へ下げます。すでに目的のレートのときはコピーするだけです。

## 時刻

点の `time` は、マイク開始からの秒です。サンプル数を `AudioContext.sampleRate` で割った値で、`performance.now()` ではありません。マイクを止めて再開しても、この秒は続き、画面の点も残ります。保存した録音の再生だけは 0 秒から始め、始めるときに画面の点を消します。

SwiftF0 のフレーム時刻は 16 kHz ストリームの先頭が 0 秒です。モデルの準備が遅れてストリームを後から作った場合、`PitchEngine` が `swiftOrigin` を足し、マイク開始からの秒に揃えます。SwiftF0 の点は公式実装どおり 176 ms 遅れて確定するので、同じ瞬間の ACF2+ より左に出ます。推論は `src/audio/swiftf0.worker.ts` の `InferenceSession` が行います。メインスレッドは音声バッファのコピーを渡し、`pitch` と `confidence` を受け取ります。点の時刻は動かしません。

Tiny-CREPE の点は、64 ms の窓の中心の時刻です。窓の後半が揃うまで 32 ms かかります。pYIN の点はフレーム時刻で、HMM が確定するまで描かれません。Basic Pitch の点は 22050 Hz ストリーム上のフレーム時刻です。最初の窓が揃うまで約 2 秒かかり、その後も窓の終端より約 0.17 秒手前までしか確定しません。いずれの遅延も、点の時刻を「今」へ動かしません。

描画の「今」は、直近チャンクの時刻と、最後の点の時刻の大きい方です。横軸は常にその「今」から 8 秒前までです。

## 検出器の選択

`PitchEngine.detector` は `"acf2"`、`"acf-basic"`、`"mpm"`、`"pyin"`、`"swiftf0"`、`"crepe"`、`"basic-mono"`、`"basic-poly"` のいずれかです。保存が無いときの画面の初期値は `"acf-basic"` です。`PitchEngine` のフィールドは `"acf2"` で始まり、`session.ts` を読み込んだときの `restoreSettings()` が、localStorage かこの初期値で上書きします。

ACF2+、ACF2+→Basic、MPM は、選択中のときだけ 16 ms 以上間隔を空けて実行します。pYIN は選択中だけチャンクを渡します。外すとトラッカーを捨て、次に選んだときにマイクの今の時刻から作り直します。SwiftF0 はモデルの読み込みが終わるとストリームを作り、選択に関係なく 16 kHz の音声を流し続けます。推論は裏で進みますが、`onPoint` に載るのは選択中の検出器だけです。切り替えた直後から SwiftF0 の確定フレームが出るのは、この先行入力のためです。

Tiny-CREPE と Basic Pitch のリサンプルは、マイクが開いているあいだ続けます。推論するのは、その検出器が選ばれてモデルの読み込みが終わったときだけです。Basic Pitch の単音と重音は同じ推論で、結果を返すときにどちらの読み方をするかが決まります。単音はコントゥアの尾根を直前の音程から追い、有音が続く数フレームの中央値で細かい揺れを取ります。ノート頭は、尾根の近くに音があるかの判定にだけ使います。重音は半音ごとの読み方のままです。ACF2+→Basic は単音の読み方だけを使い、`onRevise` で暫定点を置き換えます。`onPoint` には ACF2+ の暫定点だけが載り、大きな音名はそちらだけを更新します。

SwiftF0 のモデル読み込みはページ表示時の `preloadModel()` で始まります。Tiny-CREPE は、設定でそれを選んだときに始まります。Basic Pitch は、単音、重音、ACF2+→Basic のいずれかを選んだときに始まります。失敗すると各モデルがエラーを覚え、同じページでは再試行しません。信号処理の検出器はそのまま使えます。ACF2+→Basic は、モデルの読み込み前も右端を ACF2+ で描きます。

停止時は MediaStream のトラックを止め、AudioContext を閉じ、SwiftF0 ストリームを `flush` します。`flush` は残り 176 ms 分のフレームも返します。Tiny-CREPE と Basic Pitch は、走っている推論の結果を捨てます。

## 画面の層

画面は Feature-Sliced Design です。上の層が下の層を import します。`shared` は `features` を知らず、`src/audio` は画面を知りません。

| 層 | 場所 | 役割 |
|---|---|---|
| app | `src/app` | React の起点と、Tailwind の `@theme` |
| pages | `src/pages/recorder` | ヘッダー、ステージ、録音一覧、フッターの組み立て |
| widgets | `src/widgets` | ヘッダー、フッター、ステージ、設定ダイアログ、録音一覧 |
| features | `src/features` | マイク、録音、再生、表示、スケール、音程の範囲、ダウンロード、一覧の開閉 |
| entities | `src/entities` | セッション、録音ファイル、ピッチの計算と描画 |
| shared | `src/shared` | ボタン、ダイアログ、Switch、Input。色は `@theme` のトークン |
| audio | `src/audio` | 検出器と符号化。画面を層に分けたときもここは動かしていない |

UI の import は `@/` です。`tsconfig.json` と `vite.config.ts` がこれを `src/` へ向けます。`session.ts` と `src/audio` は相対パスのままです。

`src/entities/session/model/session.ts` は React を import しません。このモジュールを値として読むと `PitchEngine` が作られ、末尾の `restoreSettings()` が設定を戻し、SwiftF0 の `preloadModel()` が始まります。画面は `use-session.ts` の `useSessionSlice` で、スナップショットの必要な項目だけを購読します。音程の点が追加されても、その項目を購読していない部品は描き直しません。設定ダイアログを開いているあいだだけ、中のフォームがスナップショット全体を購読します。

点、チャンクの RMS、追従の窓は React の state にも props にも載せません。`Stage` は時間、帯、大きさの 3 枚のキャンバスを常にマウントし、`mountStage` に渡します。`mountStage` が `requestAnimationFrame` で 3 つのグラフを描き、ステージの `ResizeObserver` で内部解像度を合わせます。表示中でないキャンバスは `invisible` です。ヘッダーの音量メーターは `bindMeter` が受け取った要素の `scaleX` を、点の購読とは別に動かします。

操作は、見た目とセッションへの接続を分けます。`ViewTabs`、`ScaleSelect`、`PitchAxisControl`、`RecordingEntries` は値とコールバックだけを受けます。`ViewSwitch`、`ScaleControl`、`PitchAxis` が `useSessionSlice` と `set*` を渡します。Storybook は見た目の側を `src/**/*.stories.tsx` に置きます。ストーリーは `session.ts` を値として import しません。型だけの import はモジュールを実行しないので、録音ファイルの型は使えます。`npm run build` の `tsc` はストーリーを型チェックから外しています。Storybook の Vite は `ort-runtime` と `flac-wasm` を外し、開発サーバーの COOP / COEP ヘッダも付けません。

`src/shared/ui` は shadcn/ui の形（`cva`、`cn`、Radix）で、Button、IconButton、Dialog、Switch、Input、Label を手で書いてあります。色は `src/app/styles/index.css` の `@theme` です。背景は `#14110e`、文字は `#f3ead7`、アクセントは `#e6a15c` です。shadcn のパッケージは依存に入っていません。`components.json` は部品の置き場所を示すだけで、CLI で部品を足すとこのトークンを上書きします。スケールと音名の一覧は、端末の `select` です。

## 画面が持っている状態

`src/entities/session/model/session.ts` が次を持ちます。React のコンポーネントは、このモジュールが `publish` したスナップショットを読むだけで、点の配列は持ちません。

| 状態 | 場所 | 意味 |
|---|---|---|
| `points` | `session.ts` | 描画と CSV の元。エンジンは保持しません |
| `levels` | `session.ts` | 直近約 9 秒の RMS。帯と大きさのグラフが読む |
| `clock` | `session.ts` | 最新の音声時刻 |
| スナップショット | `session.ts` の `getSnapshot` | 音名、ボタンの文言、設定の現在値 |
| `a4` | `session.ts` と各グラフ | 基準周波数。エンジンの Hz は変えません |
| `running` | `PitchEngine` | マイクか再生が開いているか。`mode` は `idle`、`mic`、`file` |

点は 20 万件を超えると、古い方から削って 18 万件にします。消去ボタンは配列を空にするだけで、エンジンのサンプルカウンタは戻しません。停止して再開しても `samples` は続きます。リングバッファだけ新しいものに替えます。

## グラフ

画面はビューポートの高さに固定し、音程・帯・大きさのどれか一つを中央に出します。通常の線は `#f2b48a` の 1 色で、ACF2+→Basic の置き換えでもストロークを分けません。そのとき ACF2+→Basic の接続幅は確定点と同じ 0.75 半音です。設定の「検出の色分け」で、検出器ごとの色と、暫定から確定への色の切れ目に戻します。「未確定の区間」と「音域のガイド」も設定のスイッチです。

`src/entities/pitch/model/graph.ts` の全体表示は MIDI 30（F♯1 付近）から、少なくとも 108（C8）までです。どれかの上限が C8 を超えると、その音が収まるところまで上へ伸ばします。画面下の「全体 / 固定 / 追従」で、三つのグラフが同じ音程の範囲を使います。固定は下限と上限を MIDI 番号で入力するか、音名の一覧から選びます。保存されるのは 0 から 127 の整数で、その範囲は C-1 から G9 まで一つずつ音名があります。小数は最も近い半音に、範囲の外は 0 か 127 に丸めてから音名になります。幅は少なくとも 1 オクターブです。リセットは C3 から C5 に戻します。追従は指定した幅（初期値は 2 オクターブ）の窓で、最新の有音が端から約 22% に入ったときだけ動き、動いたあとはその端から約 38% の位置に置きます。無音のあいだ窓は留まり、移動そのものは約 0.2 秒で近づきます。スケールが「半音」のときは、C の線だけ音名を左に出します。コードのスケールを選ぶと、その音階の音だけに線を引き、根音に音名を付けます。規則は `src/entities/pitch/model/scale.ts` です。選択中のスケールの横に、ト音記号と五線の調号を出します。半音のときは出しません。メジャーはその長調の調号、マイナーは平行長調と同じ調号、セブンスは根音の長調から第7音を半音下げた調号です。音域のガイドを入れると、選択中の検出器の下限と上限を破線と音名で示し、下限より下と上限より上を暗くします。半音の半分を超える飛び（Basic Pitch の単音と重音、および ACF2+→Basic の確定点どうしは 0.75 半音）、50 ms を超える時間の空き、検出器の切り替わり、無音では線を切ります。色分けを入れたときの ACF2+→Basic は、暫定点どうし、および暫定と確定の境が半音の半分以内なら色が変わっても境界を共有します。Basic Pitch の重音は、近い音どうしを別の線としてつなぎます。範囲外の MIDI は上下の端に張り付きます。Hz 自体は点に残るので、CSV には範囲外の周波数も入ります。重音の CSV は、同じ時刻の音を 1 行ずつ書きます。

SwiftF0、pYIN、Tiny-CREPE、Basic Pitch、ACF2+→Basic を選択してマイクが動作し、未確定の区間を描くあいだは、最後に確定した点から右端までを、その検出器の色のアルファ 0.12 で塗ります。色分けを入れた ACF2+→Basic の帯だけは ACF2+ の色で、いちばん新しい Basic Pitch のフレームから右端までです。その検出器へ切り替えたあとまだ点が無いときは、切り替えた時刻から塗ります。この帯は未確定の区間であり、無音ではありません。停止中と、ACF2+ または MPM の選択中は塗りません。

`devicePixelRatio` に合わせてキャンバスの内部解像度を変えます。リサイズはグラフ領域の `ResizeObserver` を見ています。

大きさの表示は、横軸をピッチ、縦軸を大きさにしたグラフです。ピッチの範囲は時間のグラフと同じです。縦軸は -60 dBFS から 0 dBFS で、点の時刻に最も近いチャンクの RMS を `20 log10` で換算します。50 ms より離れたチャンクしか無い点と、-60 dBFS 未満は出しません。直近 8 秒の有音を点で示し、新しい点ほど濃くします。いちばん新しい時刻が 0.35 秒以内のときは、その点を大きく描きます。Basic Pitch の重音は、各音をその瞬間の入力の大きさで同じ高さに置きます。音域のガイドを入れると、選択中の検出器の下限と上限は縦の破線で、外側は暗くなります。`session.ts` は直近約 9 秒の RMS を `points` とは別に保持します。

その下に、時間とピッチのグラフと同じ軸で、音量を線のまわりのにじみとして重ねたグラフがあります。芯は幅 2px で、通常の色は音程の 1 色、色分けを入れると検出器の色です。音量は声部ごとに約 58 ms の中央値でならし、声部の内側では隣の点まで直線で補間します。−48 dB 以下は芯だけ、−12 dB 以上は芯の外側 12px で、その間は dB に比例して太さが連続して変わります。芯の色は同じ音量で白へ最大 25% 混ぜます。にじみ自体は検出器の色のまま、外側ほど薄くします。直近 0.3 秒は不透明で、それより前の不透明度は 0.9 です。線を切る条件は時間のグラフと同じです。Basic Pitch の重音は声部ごとににじみますが、入力が 1 本なので同じ時刻の音量は同じです。下限と上限の破線、未確定の帯も時間のグラフと同じです。

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
| 画面の配置 | `src/pages/recorder`、`src/widgets/header`、`footer`、`stage`、`library` |
| 一つの操作の見た目 | `src/features/<名前>/ui` の、値とコールバックだけを受ける部品。Storybook もそこへ足す |
| その操作とセッションの接続 | 同じ機能の薄い部品。`useSessionSlice` と `session.ts` の `set*` |
| 共通のボタンやダイアログ | `src/shared/ui`。色は `src/app/styles/index.css` の `@theme` |
| 音名やボタンの文言 | `src/entities/session/model/session.ts` のスナップショット |
| 設定の保存 | `src/entities/session/model/preferences.ts` |
| IndexedDB の録音ファイル | `src/entities/recording/model/recordings.ts` |
| WAV、FLAC、MP3 | `src/audio/wav.ts`、`src/audio/encode.ts`、`src/audio/encode.worker.ts` |
| 線の色、見える音域、何秒分描くか | `src/entities/pitch/model/graph.ts`。帯は `ribbon-graph.ts`、大きさは `loudness-graph.ts`、追従の窓は `pitch-axis.ts`。呼び出しは `session.ts` の `mountStage` |
| マイクの制約、16 ms の間隔、再生 | `src/audio/engine.ts` |
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
| コードのスケール罫線 | `src/entities/pitch/model/scale.ts` と `src/entities/pitch/model/graph.ts` |
| WASM の配信パス | `vite.config.ts` と各 `*.worker.ts` の `wasmPaths` |

Worklet は Vite のモジュールではなく `public/capture-worklet.js` です。`AudioWorkletGlobalScope` で動き、DOM や `src/` の import は使えません。ブロック長を変えるときは、メイン側が任意長の `Float32Array` を受け取れることを確認します。今の `onChunk` は長さを固定していません。
