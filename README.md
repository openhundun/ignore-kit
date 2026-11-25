# ignore-kit

| 路径                                    | 说明                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Cargo.toml`                            | Cargo workspace 清单（`resolver = "3"`，共享依赖与 release profile）                                                    |
| `source/ignore-compose-cli/`            | 原生 CLI 包 `ignore-compose-cli`（二进制 `ignore-compose`）：`gen` 合成/写文件，`schema`/`dts` 输出契约；`--check` 检查漂移 |
| `source/ignore-compose-lib/`            | 领域包 `ignore-compose-lib`：单文件 `src/lib.rs`（模型、`Composer`、wasm ABI），不做文件 I/O                            |
| `source/ignore-compose-web/`            | SolidJS + TailwindCSS 编辑器：`src/`（TSX 组件与 wasm 宿主）、Vite 构建配置；依赖安装不生成锁文件                       |
| `deploy/ignore-compose.schema.json`     | 配置文件 JSON Schema                                                                                                    |
| `deploy/ignore-compose.d.ts`            | 配置类型 TypeScript 声明                                                                                                |
| `vendor/`                               | `github/gitignore` 全量快照（316 个模板，含 Global / community）；web 构建时复制到 `public/vendor/`                     |
| `script/ignore-compose.sh`              | `job__check`、`job__contract`、`job__vendor`、`job__web`、`job__package`、`job__release`                                |
| `.github/workflows/ignore-compose.yaml` | main push：编译检查 + 四平台构建，覆盖 `latest` release 资产；release 仅在 main 运行 |

`deploy/ignore-compose.schema.json` 与 `deploy/ignore-compose.d.ts` 由 `bash script/ignore-compose.sh job__contract` 调用 CLI 的 `schema` / `dts` 生成，不要手改。

## CLI

```sh
ignore-compose -v
ignore-compose gen -f ignore-compose.json          # 输出到 stdout
ignore-compose gen -f ignore-compose.json -w       # 写入文件
ignore-compose gen -f ignore-compose.json --check  # 检查漂移，不写
ignore-compose schema                              # schema 输出到 stdout
ignore-compose dts                                 # d.ts 输出到 stdout
```

- `gen` 默认只输出到 stdout；`-w` / `--write` 才落文件，`--check` 只比较，二者互斥。
- `gen` 只有一个输出时直接打印内容；多个输出时每个文件前打印 `==> <path>`。
- `-f` / `--config` 不传时从当前目录向上找最近的 `ignore-compose.json`；输出路径相对配置文件目录。
- 规则输出顺序：`Global/` upstream 的规则单独排序并置顶；其余 upstream 规则、否定规则、custom 规则依次跟随，组间空行。
- `-w` 与 `--check` 会先跑 `.gitignore` guard；`gen` 纯输出不跑 guard。
- `schema` / `dts` 不接受参数，只写 stdout；CI 的 `job__contract` 负责重定向到 `deploy/`。

## Web 面板

`source/ignore-compose-web` 按 OpenDesign 目录中的 11-23 原型实现，界面为英文：

- **左侧**：Entry tabs（1..N，超出宽度横向滚动）；tab 栏右侧固定的 `+` 新增、`×` 删除当前 entry（只剩 1 条时禁用），下面固定是 `source` / `transform` / `sink` 三张卡；编辑当前 entry。
- **右侧**：`Config`（`ignore-compose.json` 原文编辑器，随左侧 Form 变化同步）｜ `Preview`（只读 `.gitignore` 编辑器，3 位行号 + 1 位图标；已加载的 source 先渲染，缺失的跳过，标题右侧显示加载进度与失败红点）。
- **source**：upstream 列表，拉取时优先读 vendor；导入配置后自动预取全部 upstream（去重、已加载跳过、单个 20s 超时，vendor 优先、网络兜底）。
- **transform**：from → into；**sink**：输出路径。
- **vendor**：`vendor/raw.githubusercontent.com/github/gitignore/main/` 是上游全量快照（316 个 `.gitignore`，含 `Global/` 与 `community/`）；`job__web` 在构建前把它复制到 `public/vendor/`，拉取时先查 vendor（支持 `refs/heads/` 与 `%xx` 归一化），未命中再走网络。

构建并通过 HTTP 打开（页面会从站点根目录加载 `ignore_compose.wasm`，不要用 `file://`）：

```bash
bash script/ignore-compose.sh job__web
python3 -m http.server 8000 --directory source/ignore-compose-web/dist
```

开发模式：

```bash
cd source/ignore-compose-web
bun run dev
```

## Vendor

`vendor/` 是 `github/gitignore` 的只读快照，目录结构按 raw URL 镜像；`github-gitignore.json` 记录 commit、ref 与模板数，`github-gitignore.LICENSE` 是上游 CC0-1.0 许可。

```sh
bash script/ignore-compose.sh job__vendor step__sync    # 拉取上游 main 并同步 vendor/
bash script/ignore-compose.sh job__vendor step__verify  # 校验元数据与模板数
```

CI 在 `.github/workflows/vendor.yaml` 中提供手动 `workflow_dispatch`：同步、校验，有变化时以 `1` 提交并推送；没有变化则不产生提交。

顶层与 `Global/` 的 `.gitignore` 文件名没有冲突，但 `community/Racket.gitignore` 与顶层 `Racket.gitignore` 重名，`community/BoxLang/ColdBox.gitignore` 与 `community/CFML/ColdBox.gitignore` 也重名，因此 vendor 保留上游目录结构，不按 basename 全量平铺。
