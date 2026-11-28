# ピッチレコーダー

ブラウザだけで動く音程レコーダーです。マイクの波形から基本周波数を推定し、直近 8 秒を一画面のグラフに描きます。初期の検出は ACF2+→Basic で、ほかの検出器は設定から選べます。音声も推定結果もサーバーへ送りません。

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

Vite が `http://localhost:5173/` を表示します。ポートが使用中なら、表示された別ポートを開きます。ブラウザで「マイクを開始」を押し、許可したあと声や単音を入れると線が右端から左へ流れます。画面は React と Tailwind CSS で、設定ダイアログは Radix の Dialog と Switch です。

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

- 画面はブラウザの高さに収まり、ページ自体はスクロールしません。上にいまの音名、中央にグラフ、下に操作が並びます。
- 下の操作はアイコンです。マイク、録音、ピッチの表示、スケール、音程の範囲、前の録音、次の録音、再生、形式、ダウンロード、削除です。ピッチの表示は、時間の線、音量の帯、ピッチと大きさの点を、それぞれの形のアイコンで切り替えます。アイコンにポインタを乗せると名前が出ます。表示は一つだけ出ます。狭い画面では操作が二段になり、ピッチのグラフが横幅いっぱいに残ります。音程の範囲は「全体」「固定」「追従」です。全体は検出できる音域をすべて出します。固定は下限と上限を MIDI 番号で入力するか、音名（C3、D4、F♯3）の一覧から選びます。保存されるのは MIDI 番号です。リセットで C3 から C5 に戻します。追従は幅（オクターブ）を指定し、最新の音程が端に寄ったときだけその幅の窓を動かします。音程は窓の中央には置きません。
- スケールの初期値は「半音」で、今までどおりすべての半音に罫線があり、C だけ音名が付きます。コードを選ぶと、そのコードのスケールの音だけに罫線が変わります。メジャーは長音階、マイナーは自然短音階、セブンスはミクソリディアンです。根音はいちばん濃く音名が付き、コードトーン（根音・3度・5度、セブンスは短7度も）はその次に濃く、残りのスケール音は薄い線です。三つのグラフで同じ罫線を使います。
- 初期の検出器は ACF2+→Basic です。線は `#f2b48a` の 1 色で、置き換え前と置き換え後を分けません。設定の「検出の色分け」を入れると、ACF2+ が `#e6a15c`、MPM が `#e6d36a`、pYIN が `#c792ea`、SwiftF0 が `#7ed0cb`、Tiny-CREPE が `#8eb6f0`、Basic Pitch の単音が `#f0a0b4`、重音が `#e07a6a` になり、ACF2+→Basic は置き換え前が ACF2+、置き換え後が Basic Pitch 単音と同じ色です。検出器、マイク、A4、上限、未確定の区間、音域のガイド、CSV、グラフの消去は設定にあります。マイクは既定のほか、許可後に名前の出る入力機器を選べます。録音中は切り替えません。
- 検出器、マイク、A4、各上限、色分け、未確定の区間、音域のガイド、ピッチの表示、スケール、音程の範囲、ダウンロード形式は、このブラウザの localStorage に残ります。次に開いたときは、その設定のまま始まります。範囲外の値は読み飛ばし、その項目だけ初期値に戻します。録音の音声は IndexedDB のままです。
- 大きな音名は、いちばん新しい点を基準音 A4 で MIDI 番号に直し、最も近い半音に丸めたものです。その横の cent は、その半音からのずれです。A4 の初期値は 440 Hz で、入力は 415〜466 Hz だけ受け付けます。
- 無音の点では音名が「–」になります。信頼度を出す検出器以外は、有音が「有音」、無音が「無音」です。ACF2+→Basic の大きな音名は、置き換え前の右端だけを見ます。Basic Pitch の重音で複数の音があるときは、音名を並べ、セントの位置に音の数を出します。
- 帯の芯が音程です。太さは声部の中で音量に合わせて連続して変わります。およそ −48 dB 以下は芯だけ、−12 dB 以上がいちばん広がります。大きさのグラフは直近 8 秒の有音を点で示し、新しい点ほど濃くします。
- 「グラフを消去」は画面上の点だけ消します。マイクは止めません。
- 「CSV を保存」は、いまメモリにある点を `pitch.csv` としてダウンロードします。列は `time_s,detector,pitch_hz,midi,note,confidence,voiced` です。先頭に UTF-8 BOM を付けています。MIDI と音名は、保存した瞬間の A4 で計算します。Basic Pitch の重音は、同じ時刻の音を 1 行ずつ書きます。
- 「録音を開始」から「録音を停止」までの音を、16 bit モノラル PCM の WAV として、このブラウザの IndexedDB に保存します。マイクを開いているだけでは保存しません。録音を始めるときにマイクが止まっていれば、そのボタンがマイクも開きます。録音を止めてもマイクは開いたままです。録音中はマイクを止められません。一覧は `files`、中身は `blobs` です。一覧を出すときに音声までは読みません。音は端末の中に残り、サーバーへは送りません。48 kHz で 1 分あたり約 5.8 MB です。
- 広い画面ではグラフの右に録音の一覧があります。狭い画面では一覧を畳み、下の一覧アイコンで右から開きます。行を押すとその録音を選び、下の前へ・次へでも隣へ移ります。「再生」でスピーカーへ出しながら同じ検出器で音程を描きます。再生を始めると、それまで画面にあった点は消え、時刻は録音の先頭に戻ります。一覧が画面より長いときは、その欄だけがスクロールします。
- 「ダウンロード」は、選んだ録音を WAV、FLAC、MP3 のいずれかで保存します。WAV と FLAC は 16 bit のロスレスです。MP3 は 192 kbps です。FLAC は [libflacjs](https://github.com/mmig/libflac.js)（MIT、中身は BSD の libFLAC）、MP3 は [@breezystack/lamejs](https://github.com/shijinyu/lamejs)（LGPL-3.0 の LAME 移植）です。WAV はこのリポジトリで書いています。変換中も画面が止まらないよう、FLAC と MP3 は Worker で符号化します。
- 点は最大約 20 万件まで保持し、超えると古い方から削って約 18 万件に戻します。

## ディレクトリ

```text
mise.toml                 Node 22 の指定
package.json              npm scripts と依存
vite.config.ts            開発サーバーのヘッダと ONNX Runtime の配信
index.html                画面の起点
public/capture-worklet.js マイク波形を 512 サンプルずつメインへ渡す
public/models/swift-f0.onnx
public/models/crepe-tiny.onnx
public/models/nmp.onnx
public/models/LICENSE-*.txt
src/main.tsx              React の起点
src/ui/app.tsx            一画面の配置、操作、設定
src/session.ts            マイク、録音、再生、描画ループ
src/preferences.ts        設定の localStorage
src/recordings.ts         IndexedDB の録音ファイル
src/audio/pcm.ts          Float32 と 16 bit PCM
src/audio/wav.ts          WAV の読み書き
src/audio/encode.ts       FLAC と MP3
src/audio/encode.worker.ts 変換をメインスレッドの外で行う
src/audio/download.ts     形式を選んでファイルを作る
src/graph.ts              時間とピッチのキャンバス
src/loudness-graph.ts     ピッチと大きさのキャンバス
src/loudness.ts           大きさの dB と、点に対応する RMS
src/ribbon-graph.ts       時間・ピッチ・音量のキャンバス
src/ribbon.ts             音量のにじみ幅と、声部に沿った中央値
src/scale.ts              コードごとのスケール罫線
src/pitch-axis.ts         音程の表示範囲（全体、固定、追従）
src/index.css             Tailwind と画面の色
src/audio/engine.ts       マイク、保存した録音の再生、検出器の選択、時刻
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

ログイン、録音ファイルのアップロード、MIDI ファイルの書き出し、ピッチの平滑化、Google Drive への保存は入っていません。和音を別々の音として出すのは Basic Pitch の重音だけです。音程は CSV、音声はこのブラウザの IndexedDB と、そこからの WAV / FLAC / MP3 です。検出の上限は画面で変えられます。初期値は ACF2+ と MPM が 4500 Hz、pYIN が 2000 Hz、SwiftF0 が 2093.75 Hz、Tiny-CREPE が約 2005 Hz、Basic Pitch が約 4186 Hz です。下限は検出器ごとに固定で、画面からは変えません。
