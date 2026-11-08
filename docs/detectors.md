# 検出器

両方とも単音向けです。和音を入れると、いちばん周期らしい成分が 1 つ返るだけで、音を分離しません。戻り値は Hz です。音名への変換は検出のあと、`src/audio/notes.ts` が行います。

```text
midi = 69 + 12 * log2(hz / a4)
hz   = a4 * 2 ** ((midi - 69) / 12)
```

A4 が 440 Hz のとき、MIDI 69 は 440 Hz です。

エンジンが画面へ渡す点は次の形です。

```ts
type PitchPoint = {
  time: number;          // マイク開始からの秒
  hz: number | null;     // null は無音
  confidence: number;    // ACF2+ の有音は 1、無音は 0
  detector: "acf2" | "swiftf0";
};
```

## ACF2+

`src/audio/acf2.ts` の `acf2Plus` です。Pitchreader が使っている自己相関と同じ手順で、Chris Wilson の PitchDetect に 2016 年提案として入り、2020 年に取り込まれた dalatant の実装に合わせています。

入力は `Float32Array` とサンプルレートです。窓長は `acfWindowSize` が決め、目標約 50 ms を 2 の累乗に丸め、1024〜4096 に収めます。16 kHz なら 1024、48 kHz なら 2048 です。

手順は次のとおりです。

1. RMS が 0.01 未満なら `-1`（無音）。
2. 先頭と末尾を、絶対値が 0.2 未満になる最初の位置まで捨てる。
3. 残った波形の自己相関 `r(τ) = Σ x[i] * x[i+τ]` を、重なり数で割らずに計算する。
4. lag 0 から値が下がり続けるあいだ τ を進める。
5. その先で `r(τ)` が最大の τ を周期の整数部分にする。
6. その点と左右の 3 点に放物線を当て、`period = τ - b / (2a)` とする。`a = (左 + 右 - 2 * 中央) / 2`、`b = (右 - 左) / 2`。
7. `sampleRate / period` を返す。周期が 1 以下、または結果が有限な正の数でなければ `-1`。

エンジンは `-1` を `hz: null` にします。呼び出し間隔は音声時刻で 16 ms 以上です。フレーム間の追跡やメディアンは入れていません。

テストは `src/audio/acf2.test.ts` です。16 kHz と 48 kHz の正弦波 82.41、220、440、880 Hz が 10 セント以内であること、振幅 0.001 と無音が `-1` であることを見ています。式やしきい値を変えたら、この許容を更新する前に、なぜ誤差が増えたかをテスト名かコメントに残します。

## SwiftF0

Lars Nieradzik の SwiftF0 0.3 系モデルです。重みは MIT で、`public/models/swift-f0.onnx` に同梱しています。論文は arXiv:2508.18440 です。学習コードとブラウザ向けの説明は upstream の `lars76/swift-f0` と `lars76/swift-f0-training` にあります。

モデルの契約は次です。

| 名前 | 方向 | 型と形 | 意味 |
|---|---|---|---|
| `audio` | 入力 | float32 `[1, samples]` | 16 kHz、振幅はおよそ −1〜1 |
| `fmin` | 入力 | float32 スカラー | 下限 Hz。このアプリは 46.875 |
| `fmax` | 入力 | float32 スカラー | 上限 Hz。このアプリは 2093.75 |
| `pitch` | 出力 | float64 `[1, frames]` | 各フレームの Hz |
| `confidence` | 出力 | float32 `[1, frames]` | 0〜1。0.5 以上を有音とする |

フレームは 256 サンプル、つまり 16 ms です。スカラーのテンソル次元は `[]` です。`src/audio/swiftf0-session.ts` がこの形で `InferenceSession.run` を呼びます。

ストリーム制御は `src/audio/swiftf0.ts` の `SwiftF0Stream` です。upstream の `PitchStream` に合わせ、次の定数を使います。

| 定数 | 値 | 意味 |
|---|---|---|
| `SWIFT_LOOKAHEAD_FRAMES` | 10 | フレームを確定する前に必要な後続。176 ms |
| `SWIFT_LEFT_FRAMES` | 11 | 確定後もバッファに残す過去。モデルの受容野 |
| `SILENCE_PEAK` | 0.001 | そのホップの最大絶対値がこれ未満なら信頼度を 0 にする |

モデル自身は無音を落としません。デジタル無音がランダムな有音に見えることがあるため、推論のあとでホップごとにゲートします。ゲートは upstream の `_run` と同じ位置です。

`push` はチャンクをキューに積み、推論が重なっても 1 本ずつ処理します。`flush` は先読みを待たず、残りのフレームを出してストリームを閉じます。`whenIdle` はテストがキューの消化を待つためのメソッドで、画面からは使いません。

16 kHz でない入力は `StreamResampler` が下げます。デシメーションの前に、カットオフを出力レートの 0.45 倍とした一次ローパスを通します。すでに 16 kHz のときはサンプルをコピーするだけです。

有音判定はエンジン側で `confidence >= 0.5 && hz > 0` です。範囲外や NaN の Hz は 0 として扱い、無音になります。

テスト `src/audio/swiftf0.test.ts` はモデルを呼びません。偽の推論関数で、10 フレームでは点がまだ出ないこと、さらに 10 フレームで最初の 10 フレームが出ること、無音ゲートで信頼度が 0 になることを見ています。モデルファイル自体を正弦波で確かめる自動テストは、リポジトリには入っていません。手元で確かめるときは Node 用の `onnxruntime-node` を一時的に入れ、1 秒の 440 Hz 正弦波を 16 kHz で通すと、中央フレームは約 440 Hz、信頼度は 0.5 を超えます。確認が終わったらそのパッケージは外し、`package.json` の依存には残しません。

## 検出器を足すとき

1. `DetectorId` に識別子を足す。`src/audio/engine.ts` にあります。
2. `onChunk` から新しい推定を呼び、選択中のときだけ `onPoint` する。無音は `hz: null` にします。
3. `src/graph.ts` の `COLOR` に線の色を足す。
4. `index.html` の検出ラジオに choice を足す。`src/main.ts` は `input[name="detector"]` の value をそのまま `engine.detector` に入れます。
5. モデルや WASM が増える場合は、`public` へ `.mjs` を置かず、`vite.config.ts` の配信方法に合わせます。詳細は [architecture.md](architecture.md) の「ONNX Runtime の置き場所」です。
6. 式に数値の期待があるものは `src/audio/*.test.ts` に足し、`mise exec -- npm test` で通します。マイクを使ったテストはまだありません。
