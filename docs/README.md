# ピッチレコーダー

ブラウザだけで動く音程レコーダーです。マイクの波形から基本周波数を推定し、直近 8 秒をグラフに描きます。検出器は ACF2+、MPM、pYIN、SwiftF0、Tiny-CREPE、Basic Pitch の単音と重音を切り替えられます。音声も推定結果もサーバーへ送りません。

この文書は、コードを初めて開いた人が環境を起動し、どこを読めばよいか分かるところまでを担当します。処理のつながりは [architecture.md](architecture.md)、検出器の契約は [detectors.md](detectors.md) です。

## 前提

- Windows 上で開発している想定です。コマンドは PowerShell です。
- Node.js は mise で入れます。バージョンはリポジトリ直下の `mise.toml` が `node = "22"` と指定しています。
- マイクが使えること。ページは `http://localhost` で開けばマイク許可を求められます。
- パッケージマネージャは npm です。`package-lock.json` を使います。

## 最初の起動

リポジトリのルートで実行します。

```powershell
mise install
mise exec -- npm install
mise exec -- npm run dev
```

Vite が `http://localhost:5173/` を表示します。ポートが使用中なら、表示された別ポートを開きます。ブラウザで「マイクを開始」を押し、許可したあと声や単音を入れると線が右端から左へ流れます。

mise をシェルに有効化している場合は `mise exec --` を外して `npm run dev` でも同じです。有効化していないシェルで `npm` だけ打つと、別の Node を掴むことがあります。

## 日常のコマンド

| コマンド | 役割 |
|---|---|
| `mise exec -- npm run dev` | 開発サーバー。ソースを保存するとページが更新されます |
| `mise exec -- npm test` | Vitest。正弦波と、モデルを呼ばないストリーム制御 |
| `mise exec -- npm run build` | 型チェックのあと `dist/` を作ります |
| `mise exec -- npm run preview` | `dist/` をローカル配信します |

`vite.config.ts` を変えたあとは、開発サーバーを止めてから `npm run dev` をやり直します。設定ファイルは起動中のプロセスに自動では入りません。

## 画面の仕様

- 初期の検出器は ACF2+ です。線の色は ACF2+ が `#e6a15c`、MPM が `#e6d36a`、pYIN が `#c792ea`、SwiftF0 が `#7ed0cb`、Tiny-CREPE が `#8eb6f0`、Basic Pitch の単音が `#f0a0b4`、重音が `#e07a6a` です。ACF2+→Basic の選択枠は `#f2b48a` で、線は置き換え前が ACF2+、置き換え後が Basic Pitch 単音と同じ色です。
- 大きな音名は、いちばん新しい点を基準音 A4 で MIDI 番号に直し、最も近い半音に丸めたものです。その横の cent は、その半音からのずれです。A4 の初期値は 440 Hz で、入力は 415〜466 Hz だけ受け付けます。
- 無音の点では音名が「–」になります。ACF2+ と ACF2+→Basic 以外は信頼度を表示します。この 2 つの有音は「ACF2+」、無音は「無音」です。ACF2+→Basic の大きな音名は、置き換え前の右端だけを見ます。Basic Pitch の重音で複数の音があるときは、音名を並べ、セントの位置に音の数を出します。
- 「グラフを消去」は画面上の点だけ消します。マイクは止めません。
- 「CSV を保存」は、いまメモリにある点を `pitch.csv` としてダウンロードします。列は `time_s,detector,pitch_hz,midi,note,confidence,voiced` です。先頭に UTF-8 BOM を付けています。MIDI と音名は、保存した瞬間の A4 で計算します。Basic Pitch の重音は、同じ時刻の音を 1 行ずつ書きます。
- 点は最大約 20 万件まで保持し、超えると古い方から削って約 18 万件に戻します。

## ディレクトリ

```text
mise.toml                 Node 22 の指定
package.json              npm scripts と依存
vite.config.ts            開発サーバーのヘッダと ONNX Runtime の配信
index.html                画面の骨組み
public/capture-worklet.js マイク波形を 512 サンプルずつメインへ渡す
public/models/swift-f0.onnx
public/models/crepe-tiny.onnx
public/models/nmp.onnx
public/models/LICENSE-*.txt
src/main.ts               ボタン、CSV、描画ループ
src/graph.ts              キャンバスの五線とピッチ線
src/style.css
src/audio/engine.ts       マイク、検出器の選択、時刻
src/audio/acf2.ts         ACF2+
src/audio/acf-basic.ts    ACF2+ の暫定点を Basic Pitch で置き換える
src/audio/mpm.ts          McLeod Pitch Method（pitchfinder）
src/audio/pyin.ts         pYIN（@audio/pitch-pyin）
src/audio/swiftf0.ts      SwiftF0 のストリーム制御（モデルは呼ばない）
src/audio/crepe.ts        Tiny-CREPE のフレームと復号
src/audio/basicpitch.ts   Basic Pitch の窓と単音・重音
src/audio/*-session.ts    推論を Worker へ渡す
src/audio/*.worker.ts     ONNX Runtime でモデルを実行
src/audio/resample.ts     16 kHz または 22050 Hz への変換
src/audio/notes.ts        Hz と MIDI、音名
src/onnxruntime-web-wasm.d.ts  wasm ビルドの型
```

`node_modules/` と `dist/` は生成物です。`public/ort/` は作りません。理由は [architecture.md](architecture.md) の「ONNX Runtime の置き場所」です。

## このアプリがやらないこと

ログイン、録音ファイルのアップロード、MIDI ファイルの書き出し、ピッチの平滑化は入っていません。和音を別々の音として出すのは Basic Pitch の重音だけです。保存できるのはブラウザ内の CSV だけです。検出の上限は画面で変えられます。初期値は ACF2+ と MPM が 4500 Hz、pYIN が 2000 Hz、SwiftF0 が 2093.75 Hz、Tiny-CREPE が約 2005 Hz、Basic Pitch が約 4186 Hz です。下限は検出器ごとに固定で、画面からは変えません。
