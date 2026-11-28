import { execFileSync } from "node:child_process";

const REVIEW_MARK = "AI レビューサマリー";

function isVisualPath(file) {
  if (file.endsWith(".tsx") || file.endsWith(".css")) return true;
  return /^src\/entities\/pitch\/model\/(?:graph|loudness-graph|ribbon-graph|ribbon)\.ts$/.test(file);
}

function hasImage(body) {
  return /user-attachments\/|!\[[^\]]*\]\(https?:\/\/|<img\s/i.test(body);
}

function ghJsonLines(args) {
  const raw = execFileSync("gh", args, { encoding: "utf8" });
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function check({ files, comments }) {
  const visual = files.filter(isVisualPath);
  const reviews = comments.filter((body) => body.includes(REVIEW_MARK));
  if (reviews.length === 0) {
    return {
      ok: false,
      message:
        "PR コメントにレビューレポートがありません。親が docs/review/report-format.md のテンプレートを gh pr comment で載せてください。子の PR 本文では足りません。",
    };
  }
  if (visual.length === 0) return { ok: true, message: "レビューコメントを確認しました。" };
  const withImages = reviews.filter(hasImage);
  if (withImages.length === 0) {
    return {
      ok: false,
      message: `見た目の変更には、レビューと同じコメントの画像が必要です。変更前と変更後を gh pr comment --attach で載せてください。\n${visual.join("\n")}`,
    };
  }
  return { ok: true, message: "レビューコメントと画像を確認しました。" };
}

function selfTest() {
  const missingReview = check({ files: ["src/shared/ui/number-field.tsx"], comments: ["Closes #21"] });
  const missingImage = check({
    files: ["src/entities/pitch/model/graph.ts"],
    comments: [`## ${REVIEW_MARK}\n判定だけ`],
  });
  const ok = check({
    files: ["src/features/scale/ui/key-signature.tsx", "src/entities/pitch/model/scale.test.ts"],
    comments: [`## ${REVIEW_MARK}\n![変更後](https://github.com/user-attachments/assets/abc)`],
  });
  const docsOnly = check({
    files: ["docs/architecture.md"],
    comments: [`## ${REVIEW_MARK}\n画像は不要`],
  });
  if (missingReview.ok || missingImage.ok || !ok.ok || !docsOnly.ok) {
    console.error("self-test failed");
    console.error({ missingReview, missingImage, ok, docsOnly });
    process.exit(1);
  }
  if (!isVisualPath("src/entities/pitch/model/graph.ts") || isVisualPath("src/entities/pitch/model/graph.test.ts")) {
    console.error("self-test failed: path classification");
    process.exit(1);
  }
  console.log("self-test ok");
}

function pullRequest() {
  const repo = process.env.GITHUB_REPOSITORY ?? "uttne/recoding";
  const pr = process.argv[2] ?? process.env.PR_NUMBER;
  if (!pr) {
    console.error("PR 番号を引数か PR_NUMBER で渡してください。");
    process.exit(1);
  }
  const files = ghJsonLines([
    "api",
    "--paginate",
    `repos/${repo}/pulls/${pr}/files`,
    "--jq",
    ".[] | {filename: .filename} | @json",
  ]).map((file) => file.filename);
  const comments = ghJsonLines([
    "api",
    "--paginate",
    `repos/${repo}/issues/${pr}/comments`,
    "--jq",
    ".[] | {body: .body} | @json",
  ]).map((comment) => comment.body ?? "");
  const result = check({ files, comments });
  console.log(result.message);
  if (!result.ok) process.exit(1);
}

if (process.argv.includes("--self-test")) selfTest();
else pullRequest();
