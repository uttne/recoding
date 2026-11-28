# 親エージェントのオーケストレーション

人間は親エージェントとだけ話す。親は実装を自分で抱えず、Orca の子 worktree と子エージェントに渡す。コマンドは Orca 1.4.280 の `orca`（`orca.exe`）で確認したもの。

このリポジトリはブラウザ向けの音程レコーダー（TypeScript、React、Vite）である。データベースは無い。環境の入れ方、依存のインストール、テスト、ビルドは `docs/development.md` だけに従う。そこに無いコマンドを作らない。子のプロンプトに書くテストも、その文書の `mise exec -- npm test` である。

## 1. 役割分担

親は作業を、変更ファイルがほとんど重ならない単位に分ける。1 単位が 1 つの GitHub Issue になる。番号の読み方と起票は「5. GitHub Issue 連携」に従う。

親が自分で行うのは、分割、Issue の起票、子の起動、結果の確認、作業ブランチの push、PR の作成、人間への報告までである。子のプロンプトには、Issue のタイトル・本文・受け入れ条件、触ってよいパス、完了時に `docs/development.md` のテストコマンドを実行することを書く。

## 2. 子ワークスペースの作成と実行

使うエージェントは `orca agent installed --json` の `default: true` とする。人間が名前を指定したときはその id にする。

サブタスクごとに、現在のワークスペースの子として worktree を作る。先に「5. GitHub Issue 連携」で Issue 番号とブランチ名を決める。Git の起点はリポジトリの既定ベース（`main`）なので、`--base-branch` は付けない。画面を子へ切り替えないので、`--activate` と `--run-hooks` は付けない。`--branch` にブランチ名、`--issue` に Issue 番号を渡す。`--setup run` で `orca.yaml` のセットアップを走らせる。そのコマンドは `docs/development.md` の依存インストールと同じ `mise exec -- npm ci` である。

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

子のパスは `worktree create --json` の id と path から取る。親はそこで `git status`、`git diff`、`mise exec -- npm test` を見てから、「5. GitHub Issue 連携」の手順で作業ブランチを push し、PR を作る。

親は `gh pr merge` を実行しない。`main` への push と `main` へのマージは、人間の承認があってから行う。PR の URL、変更概要、テスト結果を人間に渡し、レビューとマージの判断は人間が行う。

## 4. 後片付け

報告が済み、その子が不要になってから削除する。セレクタは作成時の `id:<repoId>::<path>` を使う。`current` と `active` では削除できない。

```text
orca worktree rm --worktree "id:<repoId>::<path>" --json
```

削除が拒否されたときだけ `--force` を付ける。ローカルブランチは残る。人間がブランチも捨てると言ったときだけ `--delete-branch` を付ける。未マージの変更は Orca がブランチを残すので、結果を人間に伝える。

## 5. GitHub Issue 連携

リモートは `uttne/recoding`、既定ブランチは `main` である。`.github/ISSUE_TEMPLATE/` と `.github/pull_request_template.md` は無い。本文は下の見出しで書く。テンプレートが増えたら、その見出しを満たしたうえで `Closes #<番号>`、変更点、テスト結果を残す。`gh` は対話プロンプトを出さないよう、本文はファイルに書いて `--body-file` で渡す。

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

### PR の作成

子の実装とテストが終わり、親が差分と `mise exec -- npm test` を確認してから、子の worktree で機能ブランチを push し、PR を作る。本文ファイルには、先頭近くに `Closes #<number>` を書き、変更点の要約と実行したテストの結果を続ける。

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

CI を見るときは、作成された PR 番号で確認する。

```text
gh pr checks <pr-number>
```

### 安全ガード

機能ブランチの push と `gh pr create` までは親が進めてよい。`gh pr merge` は実行しない。作成後、PR の URL、変更概要、テスト結果を人間に報告し、レビューとマージの判断を委ねる。
