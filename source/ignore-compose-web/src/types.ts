/** 编辑器中的覆盖规则草稿。语义：from 空 + into 有值 = 追加；into 空 = drop；from 未命中报错。 */
export interface OverrideDraft {
    from: string;
    into: string;
}

/** 编辑器中的条目草稿。upstream 为空数组表示纯自定义条目（只消费追加规则）。 */
export interface EntryDraft {
    upstream: string[];
    override: OverrideDraft[];
}

/** 编辑器中的一个输出路径及其条目列表。 */
export interface PathDraft {
    path: string;
    entries: EntryDraft[];
}

export type SourceState = "idle" | "loading" | "loaded" | "failed";

/** 单个 upstream key 的拉取状态。 */
export interface SourceStatus {
    state: SourceState;
    error?: string;
}

/** 全部编辑状态；所有变更均不可变更新。 */
export interface EditorState {
    paths: PathDraft[];
    /** upstream key -> 模板内容；只发给 wasm compose，不持久化、不导出。 */
    sources: Record<string, string>;
    /** upstream key -> 拉取状态。 */
    sourceStatus: Record<string, SourceStatus>;
}

/** 发给 wasm 的 config 形状（与 ignore-compose.json 一致）。 */
export type ComposeConfig = Record<string, EntryDraft[]>;

/** wasm compose 单个输出。 */
export interface ComposeOutput {
    path: string;
    content: string;
}

/** wasm plan 的返回形状（见 source/ignore-compose-lib/src/exports.rs）。 */
export interface PlanResult {
    upstreams: string[];
    outputs: string[];
}

export type StatusKind = "info" | "error";

/** 顶部状态条消息。 */
export interface StatusMessage {
    text: string;
    kind: StatusKind;
}
