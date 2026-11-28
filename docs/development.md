# 開発環境

このリポジトリの Node とパッケージマネージャは mise で入れる。シェルの PATH には置かない。人間もエージェントも、依存のインストール、テスト、ビルドはここに書いたコマンドだけを使う。

## ツール

`mise.toml` は Node を `22`、pnpm を `latest` と指定している。リポジトリのルートで次を実行すると、そのバージョンが入る。

```powershell
mise install
```

mise をこのディレクトリで有効化していないシェルでは、`node`、`npm`、`pnpm` は別のインストールを掴むか、`not recognized` で失敗する。有効化していないときは、すべてのコマンドを `mise exec --` のあとに続ける。

pnpm は mise のツールとして入っているだけで、依存のインストールには使わない。ロックは `package-lock.json` である。`pnpm install` も、mise を通さない `npm` も実行しない。

## 依存

新しい作業ツリーと、Orca が作る子 worktree では、次で入れる。

```powershell
mise exec -- npm ci
```

`orca.yaml` の `scripts.setup` は、このコマンドと同じである。Orca のセットアップが `pnpm install` や、mise を通さない `npm` を実行する設定になっているときは、その設定が先に使われ、上のコマンドは走らない。その場合は子 worktree を作らず、セットアップが `mise exec -- npm ci` になるまで直す。

## 日常のコマンド

リポジトリのルートで実行する。

| コマンド | 役割 |
|---|---|
| `mise exec -- npm ci` | `package-lock.json` どおりに依存を入れる |
| `mise exec -- npm run dev` | 開発サーバー。ソースを保存するとページが更新される |
| `mise exec -- npm test` | Vitest |
| `mise exec -- npm run build` | 型チェックのあと `dist/` を作る |
| `mise exec -- npm run preview` | `dist/` をローカル配信する |
| `mise exec -- npm run storybook` | 部品の見た目を `http://localhost:6006/` で確認する |
| `mise exec -- npm run build-storybook` | Storybook をビルドする |
| `mise exec -- npx tsc --noEmit` | 型チェックだけを行う |

`vite.config.ts` を変えたあとは、開発サーバーを止めてから `mise exec -- npm run dev` をやり直す。

mise をシェルに有効化している場合は `mise exec --` を外してよい。有効化していないシェルで外してはいけない。
