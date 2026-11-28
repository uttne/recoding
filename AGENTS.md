# 親エージェントのオーケストレーション

人間は親エージェントとだけ話す。親は実装を自分で抱えず、Orca の子 worktree と子エージェントに渡す。コマンドは Orca 1.4.280 の `orca`（`orca.exe`）で確認したもの。

このリポジトリはブラウザ向けの音程レコーダー（TypeScript、React、Vite）である。データベースは無い。環境の入れ方、依存のインストール、テスト、ビルドは `docs/development.md` だけに従う。そこに無いコマンドを作らない。子のプロンプトに書くテストも、その文書の `mise exec -- npm test` である。実装後のレビューは `docs/review/common-criteria.md` と `docs/review/project-criteria.md`、人間への報告は `docs/review/report-format.md` に従う。手順は「4. レビューおよび報告ルール」である。

## 1. 役割分担

親は作業を、変更ファイルがほとんど重ならない単位に分ける。1 単位が 1 つの GitHub Issue になる。番号の読み方と起票は「6. GitHub Issue 連携」に従う。

親が自分で行うのは、分割、Issue の起票、子の起動、結果の確認、レビュー、そのレビューを PR に載せること、人間へのマージの依頼までである。作業ブランチの push と PR の作成は、実装した子が行う。親は `git push` も `gh pr create` も実行しない。子のプロンプトには、Issue のタイトル・本文・受け入れ条件、触ってよいパス、完了時に `docs/development.md` のテストコマンドを実行すること、その後に自分でブランチを push して PR を作ることを書く。子は `gh pr merge` を実行しない。子が作る PR 本文に AI レビューサマリーは書かない。親がレビューしたあと、`docs/review/report-format.md` のレポートと、人間が判断するための画像や図を、その PR のコメントに載せる。

## 2. 子ワークスペースの作成と実行

使うエージェントは `orca agent installed --json` の `default: true` とする。人間が名前を指定したときはその id にする。

サブタスクごとに、現在のワークスペースの子として worktree を作る。先に「6. GitHub Issue 連携」で Issue 番号とブランチ名を決める。Git の起点はリポジトリの既定ベース（`main`）なので、`--base-branch` は付けない。画面を子へ切り替えないので、`--activate` と `--run-hooks` は付けない。`--branch` にブランチ名、`--issue` に Issue 番号を渡す。`--setup run` で `orca.yaml` のセットアップを走らせる。そのコマンドは `docs/development.md` の依存インストールと同じ `mise exec -- npm ci` である。

Issue の実装に `orca orchestration worker-start`、`task-create`、`run-create`、`dispatch` は使わない。これらには `--branch` と `--issue` が無く、起動結果のハンドルもこの手順の待ち方と合わない。`worker-start` が失敗したあとの `--retry-of` でも、同じ起動を繰り返さない。

子を作る前に、Orca が実行するセットアップ文を見る。`docs/development.md` の `mise exec -- npm ci` でないときは子を作らない。mise を通さない `pnpm` や `npm` は、この環境では見つからず失敗する。`orca.yaml` より先に別のコマンドが走る設定なら、その設定を開発環境のドキュメントのコマンドに直してから作る。

```text
orca worktree create --name issue-<number>-<slug> --branch <type>/issue-<number>-<slug> --issue <number> --parent-worktree active --setup run --agent <agent-id> --prompt "<brief>" --json
```

このコマンドは応答の JSON が返るまで手前で待つ。別プロセスへ切り離して中断しない。`<brief>` には、その Issue の番号、タイトル、本文、コメントにある受け入れ条件、触ってよいパスをそのまま書く。

起動応答が失われたときは、同じコマンドを `--retry-launch <operationId>` で再実行する。`operationId` が無いときは、新しい worktree を作らず、`orca worktree list --json` で既存の子を確認する。

作成後、セットアップ端末のコマンドが `docs/development.md` の `mise exec -- npm ci` であることを確認する。違うコマンドなら、その子は失敗として止め、人間に報告する。エージェントの完了は待たない。

最初の依頼は `--prompt` に載せる。追記は次のコマンドで送る。子エージェントの入力へ `orca terminal send` で打ち込まない。`terminal send` はシェルや自分のペイン用である。

```text
orca orchestration send --to <destination> --type dispatch --subject "<topic>" --body "<message>" --json
```

宛先は、端末エージェントなら `result.launch.outcome.handle`、チャットなら `orca_session_id:<id>`。長い本文はファイルに書き、`--body-file` で渡す。

完了待ちは起動結果で分ける。

- `result.launch.outcome.kind` が `terminal` のとき、ハンドルは `result.launch.outcome.handle`。

```text
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 1800000 --json
orca terminal read --terminal <handle> --json
orca agent read <session-id> --json
```

- kind が `structured`（チャット）のとき、`orca agent read orca_session_id:<id> --json` を、`state` が `working` でなくなるまで繰り返す。チャットに `terminal wait` は使えない。

複数の子は、ファイルが重ならない範囲で並行して作ってよい。

## 3. 結果の集約と安全ガード

子のパスは `worktree create --json` の id と path から取る。親はそこで `git status`、`git diff`、`docs/development.md` のテストを見てから、「4. レビューおよび報告ルール」を行う。レビューを通過したあと、子が作った PR にレビューコメントを載せ、人間へその URL とマージを依頼する。親は作業ブランチを push せず、PR も作らない。子が PR をまだ作っていないときは、`orca orchestration send` で子に push と `gh pr create` を依頼する。

親は `gh pr create` と `gh pr merge` を実行しない。レビューの掲載に `gh pr comment` は使ってよい。`main` への push と `main` へのマージは、人間が GitHub 上で行う。

## 4. レビューおよび報告ルール

子エージェントの実装完了後、人間への報告を行う際は、以下の 2 フェーズを厳守すること。

1. **レビュー実行フェーズ**
   - 実装した子エージェント自身によるセルフレビューは禁止。親エージェント（または別セッション）が検証を行う。
   - 必ず `docs/review/common-criteria.md` と `docs/review/project-criteria.md` の両方を読み込んで判定する（競合時は `project-criteria.md` を優先）。
   - `Must` の指摘がある場合は子エージェントへ差し戻す（最大 2 回まで）。2 回で解消しない場合は人間へエスカレーションする。
2. **PR への掲載と人間への依頼フェーズ**
   - レビュー通過後（またはエスカレーション時）、必ず `docs/review/report-format.md` のルールとテンプレートに従って、対象 PR にコメントとしてレポートを載せる。
   - UI 変更時のスクリーンショット、構造変更時の Mermaid 図、その他人間がマージを判断するための画像や図は、同じ PR コメントに含める。チャットだけに置いて PR に載せないことはしない。
   - 親は PR を新規作成せず、マージもしない。人間には PR の URL を渡し、GitHub 上のマージを依頼する。

差し戻しは、子の worktree へ `orca orchestration send` で送る。`terminal send` で子の入力へ打ち込まない。指摘には対象ファイル、行番号、問題点、期待する修正方針を書く。

## 5. 後片付け

報告が済み、その子が不要になってから削除する。セレクタは作成時の `id:<repoId>::<path>` を使う。`current` と `active` では削除できない。

```text
orca worktree rm --worktree "id:<repoId>::<path>" --json
```

削除が拒否されたときだけ `--force` を付ける。ローカルブランチは残る。人間がブランチも捨てると言ったときだけ `--delete-branch` を付ける。未マージの変更は Orca がブランチを残すので、結果を人間に伝える。

## 6. GitHub Issue 連携

リモートは `uttne/recoding`、既定ブランチは `main` である。`.github/ISSUE_TEMPLATE/` と `.github/pull_request_template.md` は無い。本文は下の見出しで書く。テンプレートが増えたら、その見出しを満たしたうえで `Closes #<番号>`、変更点、テスト結果を残す。`gh` は対話プロンプトを出さないよう、本文はファイルに書いて `--body-file` で渡す。子が作る PR 本文に AI レビューサマリーは書かない。`docs/review/report-format.md` のレポートと、判断に使う画像や図は、親が `gh pr comment` でその PR に載せる。

### Issue の取得

人間が Issue 番号を指定したときは、新しい Issue を作らず、要件と受け入れ条件を読む。

```text
gh issue view <number> --json title,body,labels,comments
```

受け入れ条件は本文中の条件リストを使う。コメントに追加の条件があれば、それも子のプロンプトへ入れる。

### Issue の起票

人間が大きな要望を直接渡したときは、親が変更ファイルの重ならないタスクへ分け、タスクごとに Issue を立ててから子へ割り当てる。本文ファイルは次の見出しで書く。

```text
## 要件

## 受け入れ条件
-

## 触ってよいパス
-
```

```text
gh issue create --title "<title>" --body-file <issue-body.md>
```

返った番号を、その子の `--issue` とブランチ名に使う。

### worktree とブランチ

ブランチ名は `feat/issue-<番号>-<短いスラッグ>` にする。不具合修正は `fix/issue-<番号>-<短いスラッグ>` にする。スラッグは英小文字とハイフンだけにする。作成コマンドは「2. 子ワークスペースの作成と実行」のとおり、`--branch` と `--issue` を付ける。同じブランチ名が既にあるときは、Orca が末尾に番号を付けるので、作成結果のブランチ名を PR に使う。

子への `--prompt` と、追記の `orca orchestration send --body-file` には、次を明示する。

- Issue 番号
- `gh issue view` で読んだタイトル
- 本文
- 受け入れ条件
- 触ってよいパス
- テストのあと、子が自分で `git push -u origin HEAD` と `gh pr create` を実行すること
- PR 本文は `Closes`、変更点、テスト結果までとし、AI レビューサマリーとスクリーンショットは書かないこと。それらは親がレビュー後に PR コメントへ載せる
- `gh pr merge` はしないこと

### PR の作成

PR は実装した子が、自分の worktree で作る。親は作らない。

子は実装と `docs/development.md` のテストのあと、機能ブランチを push し、PR を作る。本文ファイルには、先頭近くに `Closes #<number>` を書き、変更点の要約と実行したテストの結果を続ける。AI レビューサマリー、スクリーンショット、Mermaid 図は入れない。

```text
git push -u origin HEAD
gh pr create --base main --head <branch> --title "<title>" --body-file <pr-body.md>
```

本文の形は次のとおり。

```text
Closes #<number>

## 変更点
-

## テスト
- mise exec -- npm test:
```

親は、子が作った PR の番号で CI を見てよい。見た結果はレビューコメントに書く。

```text
gh pr checks <pr-number>
```

### レビューの掲載

親はレビュー通過後（またはエスカレーション時）、子の PR にコメントを付ける。本文は `docs/review/report-format.md` のテンプレートである。UI を変えたときは変更前と変更後のスクリーンショットを、データの流れやモジュールの依存が変わったときは Mermaid 図を、同じコメントに入れる。人間がマージを判断するための画像や図は、チャットだけに置かない。

画像は `--attach` でアップロードし、GitHub 上で見える URL にする。ローカルパスだけの記載は不可。コメント本文が `![変更前](./before.png)` のように同じファイルを参照しているときは、`--attach` がその参照をアップロード先へ書き換える。

```text
gh pr comment <pr-number> --body-file <review.md> --attach "<before.png>#変更前" --attach "<after.png>#変更後"
```

人間へのチャットは、PR の URL とマージの依頼にする。

### 安全ガード

子は機能ブランチの push と `gh pr create` まで進めてよい。`gh pr merge` は子も親も実行しない。親は `gh pr comment` でレビューを載せてよい。`main` への push とマージは人間が GitHub で行う。
