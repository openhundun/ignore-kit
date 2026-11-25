# vendor

`github/gitignore` 的只读快照，供 `ignore-compose-web` 离线读取。

```text
vendor/
├── github-gitignore.json          # commit / ref / template count
├── github-gitignore.LICENSE       # 上游 CC0-1.0
└── raw.githubusercontent.com/github/gitignore/main/
    ├── Node.gitignore
    ├── Global/macOS.gitignore
    └── community/...
```

- 上游：<https://github.com/github/gitignore>
- 路径按 raw URL 镜像，`source/ignore-compose-web/src/store.ts` 的 `vendoredUrl` 不需要额外映射。
- 顶层 164、Global 76、community 76，共 316 个 `.gitignore`。
- 顶层与 Global 的 `.gitignore` 文件名没有冲突；community 与顶层有 `Racket.gitignore` 冲突，community 内 `ColdBox.gitignore` 也有两个，因此不能全量平铺。
- 上游 3 个 symlink（`Clojure.gitignore -> Leiningen.gitignore`、`Fortran.gitignore -> C++.gitignore`、`Global/Octave.gitignore -> MATLAB.gitignore`）在同步时解引用为普通文件，避免 web 服务器对 symlink 的处理差异。
- `vendor/` 是构建输入：`job__web step__dist` 会把 `raw.githubusercontent.com` 复制到 `source/ignore-compose-web/public/vendor/`，该目录被 `.gitignore` 忽略。
- 更新：

  ```sh
  bash script/ignore-compose.sh job__vendor step__sync
  bash script/ignore-compose.sh job__vendor step__verify
  ```

- CI：`.github/workflows/vendor.yaml` 手动触发；只有 vendor 变化时才以 `1` 提交。
