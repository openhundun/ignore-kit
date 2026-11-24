import { createStore } from "solid-js/store";
import { describeError } from "./clipboard";
import type { ComposeConfig, EditorState, EntryDraft, OverrideDraft, PathDraft } from "./types";

/** 与 wasm 侧一致的输出路径规则（见 source/ignore-compose-lib/src/lib.rs validate_output_path）。 */
function validatePathDraft(path: string): void {
    if (path === "") {
        throw new Error("Output path must not be empty.");
    }
    if (path.includes("\\")) {
        throw new Error(`Output path ${path} must use forward slashes "/".`);
    }
    const segments = path.split("/");
    if (path.startsWith("/") || segments.some(segment => segment === "..")) {
        throw new Error(`Output path ${path} must be relative and must not contain "..".`);
    }
    if (segments.some(segment => segment === "." || segment === "")) {
        throw new Error(`Output path ${path} must not contain "." or empty segments.`);
    }
    const name = segments[segments.length - 1];
    if (!name.toLowerCase().includes("ignore")) {
        throw new Error(
            `Output path ${path} file name must contain "ignore" (for example .gitignore).`,
        );
    }
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
    return [...list.slice(0, index), value, ...list.slice(index + 1)];
}

function removeAt<T>(list: readonly T[], index: number): T[] {
    return [...list.slice(0, index), ...list.slice(index + 1)];
}

/** 把编辑状态序列化为 ignore-compose.json 文本（4 空格缩进 + 末尾换行）。 */
export function serializeConfig(pathList: readonly PathDraft[]): string {
    const config: ComposeConfig = {};
    for (const draft of pathList) {
        config[draft.path] = draft.entries.map(entry => ({
            upstream: [...entry.upstream],
            override: entry.override.map(rule => ({ from: rule.from, into: rule.into })),
        }));
    }
    return `${JSON.stringify(config, null, 4)}\n`;
}

/** 解析导入的 ignore-compose.json；$schema 键被忽略；错误消息面向用户具体化。 */
export function parseConfig(text: string): PathDraft[] {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new Error(`JSON parse failed: ${describeError(error)}`);
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Config root must be a JSON object.");
    }
    const pathDraftList: PathDraft[] = [];
    for (const [path, value] of Object.entries(raw)) {
        if (path === "$schema") continue;
        if (!Array.isArray(value)) {
            throw new Error(`"${path}" must be an array of entries.`);
        }
        const entryDraftList = value.map((item, entryIndex) => {
            if (item === null || typeof item !== "object" || Array.isArray(item)) {
                throw new Error(`"${path}" entry ${entryIndex + 1} must be an object.`);
            }
            const record = item as Record<string, unknown>;
            const upstreamRaw = record.upstream ?? [];
            if (!Array.isArray(upstreamRaw) || upstreamRaw.some(key => typeof key !== "string")) {
                throw new Error(
                    `"${path}" entry ${entryIndex + 1} upstream must be a string array.`,
                );
            }
            const overrideRaw = record.override ?? [];
            if (!Array.isArray(overrideRaw)) {
                throw new Error(`"${path}" entry ${entryIndex + 1} override must be an array.`);
            }
            const ruleList = overrideRaw.map((ruleRaw, ruleIndex) => {
                if (ruleRaw === null || typeof ruleRaw !== "object" || Array.isArray(ruleRaw)) {
                    throw new Error(
                        `"${path}" entry ${entryIndex + 1} rule ${ruleIndex + 1} must be an object.`,
                    );
                }
                const ruleRecord = ruleRaw as Record<string, unknown>;
                if (typeof ruleRecord.from !== "string" || typeof ruleRecord.into !== "string") {
                    throw new Error(
                        `"${path}" entry ${entryIndex + 1} rule ${ruleIndex + 1} must have string from and into.`,
                    );
                }
                return { from: ruleRecord.from, into: ruleRecord.into } satisfies OverrideDraft;
            });
            return { upstream: [...upstreamRaw], override: ruleList } satisfies EntryDraft;
        });
        pathDraftList.push({ path, entries: entryDraftList });
    }
    if (pathDraftList.length === 0) {
        throw new Error("No output paths found in config.");
    }
    for (const draft of pathDraftList) {
        validatePathDraft(draft.path);
    }
    return pathDraftList;
}

/** 把 http(s) upstream 映射到站点内的 vendor 副本；归一化 refs/heads 与百分号编码。 */
function vendoredUrl(key: string): string | null {
    let url: URL;
    try {
        url = new URL(key);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    let path: string;
    try {
        path = decodeURIComponent(url.pathname);
    } catch {
        path = url.pathname;
    }
    const normalized = path.replace(/^\/+/, "").replace(/\/refs\/heads\//, "/");
    if (normalized === "") return null;
    const encoded = normalized
        .split("/")
        .map(segment => encodeURIComponent(segment))
        .join("/");
    return new URL(`vendor/${url.host}/${encoded}`, document.baseURI).href;
}

/** 优先读取随站点发布的 vendor 副本；没有或读取失败时返回 null，由网络兜底。 */
async function loadVendored(key: string): Promise<string | null> {
    const url = vendoredUrl(key);
    if (url === null) return null;
    try {
        const response = await fetch(url, { cache: "force-cache" });
        return response.ok ? await response.text() : null;
    } catch {
        return null;
    }
}

/** 创建编辑器 store 与全部动作；所有变更均以不可变方式更新。 */
export function createEditorStore() {
    const [store, setStore] = createStore<EditorState>({
        paths: [{ path: ".gitignore", entries: [{ upstream: [], override: [] }] }],
        sources: {},
        sourceStatus: {},
    });

    function replacePath(path: string, transform: (draft: PathDraft) => PathDraft): void {
        setStore("paths", pathList =>
            pathList.map(draft => (draft.path === path ? transform(draft) : draft)),
        );
    }

    function updateEntry(
        path: string,
        entryIndex: number,
        transform: (entry: EntryDraft) => EntryDraft,
    ): void {
        replacePath(path, draft => ({
            ...draft,
            entries: replaceAt(draft.entries, entryIndex, transform(draft.entries[entryIndex])),
        }));
    }

    const actions = {
        addPath(path: string): void {
            const trimmed = path.trim();
            validatePathDraft(trimmed);
            if (store.paths.some(draft => draft.path === trimmed)) {
                throw new Error(`Output path already exists: ${trimmed}`);
            }
            setStore("paths", pathList => [
                ...pathList,
                { path: trimmed, entries: [{ upstream: [], override: [] }] },
            ]);
        },

        renamePath(path: string, nextPath: string): void {
            const trimmed = nextPath.trim();
            validatePathDraft(trimmed);
            if (trimmed !== path && store.paths.some(draft => draft.path === trimmed)) {
                throw new Error(`Output path already exists: ${trimmed}`);
            }
            setStore("paths", pathList =>
                pathList.map(draft => (draft.path === path ? { ...draft, path: trimmed } : draft)),
            );
        },

        /** 导入：整体替换输出路径列表（不可变替换）。 */
        replaceAllPaths(pathList: readonly PathDraft[]): void {
            setStore(
                "paths",
                pathList.map(draft => ({
                    path: draft.path,
                    entries: draft.entries.map(entry => ({
                        upstream: [...entry.upstream],
                        override: entry.override.map(rule => ({
                            from: rule.from,
                            into: rule.into,
                        })),
                    })),
                })),
            );
        },

        removePath(path: string): void {
            setStore("paths", pathList => pathList.filter(draft => draft.path !== path));
        },

        addEntry(path: string): void {
            replacePath(path, draft => ({
                ...draft,
                entries: [...draft.entries, { upstream: [], override: [] }],
            }));
        },

        removeEntry(path: string, entryIndex: number): void {
            replacePath(path, draft => ({
                ...draft,
                entries: removeAt(draft.entries, entryIndex),
            }));
        },

        addUpstream(path: string, entryIndex: number): void {
            updateEntry(path, entryIndex, entry => ({
                ...entry,
                upstream: [...entry.upstream, ""],
            }));
        },

        updateUpstream(path: string, entryIndex: number, row: number, key: string): void {
            updateEntry(path, entryIndex, entry => ({
                ...entry,
                upstream: replaceAt(entry.upstream, row, key),
            }));
        },

        removeUpstream(path: string, entryIndex: number, row: number): void {
            updateEntry(path, entryIndex, entry => ({
                ...entry,
                upstream: removeAt(entry.upstream, row),
            }));
        },

        addRule(path: string, entryIndex: number): void {
            updateEntry(path, entryIndex, entry => ({
                ...entry,
                override: [...entry.override, { from: "", into: "" }],
            }));
        },

        updateRule(
            path: string,
            entryIndex: number,
            ruleIndex: number,
            field: "from" | "into",
            value: string,
        ): void {
            updateEntry(path, entryIndex, entry => ({
                ...entry,
                override: replaceAt(entry.override, ruleIndex, {
                    ...entry.override[ruleIndex],
                    [field]: value,
                }),
            }));
        },

        removeRule(path: string, entryIndex: number, ruleIndex: number): void {
            updateEntry(path, entryIndex, entry => ({
                ...entry,
                override: removeAt(entry.override, ruleIndex),
            }));
        },

        /** 为 upstream key 拉取内容；仅接受 http/https，失败时保留错误状态并抛出。 */
        async fetchSource(key: string): Promise<void> {
            if (key === "" || store.sourceStatus[key]?.state === "loading") return;
            if (!/^https?:\/\//i.test(key)) {
                const message = "Only http/https sources can be fetched.";
                setStore("sourceStatus", key, { state: "failed", error: message });
                throw new Error(message);
            }
            setStore("sourceStatus", key, { state: "loading" });
            const vendored = await loadVendored(key);
            if (vendored !== null) {
                setStore("sources", key, vendored);
                setStore("sourceStatus", key, { state: "loaded" });
                return;
            }
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 20000);
            try {
                const response = await fetch(key, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}${response.statusText === "" ? "" : ` ${response.statusText}`}`,
                    );
                }
                const text = await response.text();
                setStore("sources", key, text);
                setStore("sourceStatus", key, { state: "loaded" });
            } catch (error) {
                const message = describeError(error);
                setStore("sourceStatus", key, { state: "failed", error: message });
                throw new Error(message);
            } finally {
                clearTimeout(timer);
            }
        },
    };

    return { store, actions };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
