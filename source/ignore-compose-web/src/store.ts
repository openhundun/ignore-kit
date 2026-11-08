import { createStore } from "solid-js/store";
import { describeError } from "./clipboard";
import type { ComposeConfig, EditorState, EntryDraft, OverrideDraft, PathDraft } from "./types";

/** 与 wasm 侧一致的输出路径规则（见 source/ignore-compose-lib/src/lib.rs validate_output_path）。 */
function validatePathDraft(path: string): void {
    if (path === "") {
        throw new Error("输出路径不能为空。");
    }
    if (path.includes("\\")) {
        throw new Error(`输出路径 ${path} 必须使用正斜杠 “/”。`);
    }
    const segments = path.split("/");
    if (path.startsWith("/") || segments.some(segment => segment === "..")) {
        throw new Error(`输出路径 ${path} 必须是相对路径，且不能包含 “..” 段。`);
    }
    if (segments.some(segment => segment === "." || segment === "")) {
        throw new Error(`输出路径 ${path} 不能包含 “.” 或空段。`);
    }
    const name = segments[segments.length - 1];
    if (!name.toLowerCase().includes("ignore")) {
        throw new Error(`输出路径 ${path} 的文件名必须包含 “ignore”（例如 .gitignore）。`);
    }
}

/** 统计文本行数（与文本框所见行一致，末尾换行不额外计数）。 */
export function countLines(text: string): number {
    if (text === "") return 0;
    return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
    return [...list.slice(0, index), value, ...list.slice(index + 1)];
}

function removeAt<T>(list: readonly T[], index: number): T[] {
    return [...list.slice(0, index), ...list.slice(index + 1)];
}

function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
    const moved = list[from];
    const next = removeAt(list, from);
    return [...next.slice(0, to), moved, ...next.slice(to)];
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
        throw new Error(`JSON 解析失败：${describeError(error)}`);
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("导入失败：配置根节点必须是 JSON 对象。");
    }
    const pathDraftList: PathDraft[] = [];
    for (const [path, value] of Object.entries(raw)) {
        if (path === "$schema") continue;
        if (!Array.isArray(value)) {
            throw new Error(`导入失败：“${path}” 的值必须是条目数组。`);
        }
        const entryDraftList = value.map((item, entryIndex) => {
            if (item === null || typeof item !== "object" || Array.isArray(item)) {
                throw new Error(`导入失败：“${path}” 的条目 ${entryIndex} 必须是对象。`);
            }
            const record = item as Record<string, unknown>;
            const upstreamRaw = record.upstream ?? [];
            if (!Array.isArray(upstreamRaw) || upstreamRaw.some(key => typeof key !== "string")) {
                throw new Error(
                    `导入失败：“${path}” 的条目 ${entryIndex} 的 upstream 必须是字符串数组。`,
                );
            }
            const overrideRaw = record.override ?? [];
            if (!Array.isArray(overrideRaw)) {
                throw new Error(
                    `导入失败：“${path}” 的条目 ${entryIndex} 的 override 必须是数组。`,
                );
            }
            const ruleList = overrideRaw.map((ruleRaw, ruleIndex) => {
                if (ruleRaw === null || typeof ruleRaw !== "object" || Array.isArray(ruleRaw)) {
                    throw new Error(
                        `导入失败：“${path}” 的条目 ${entryIndex} 的规则 ${ruleIndex} 必须是对象。`,
                    );
                }
                const ruleRecord = ruleRaw as Record<string, unknown>;
                if (typeof ruleRecord.from !== "string" || typeof ruleRecord.into !== "string") {
                    throw new Error(
                        `导入失败：“${path}” 的条目 ${entryIndex} 的规则 ${ruleIndex} 必须包含字符串字段 from 与 into。`,
                    );
                }
                return { from: ruleRecord.from, into: ruleRecord.into } satisfies OverrideDraft;
            });
            return { upstream: [...upstreamRaw], override: ruleList } satisfies EntryDraft;
        });
        pathDraftList.push({ path, entries: entryDraftList });
    }
    if (pathDraftList.length === 0) {
        throw new Error("导入失败：配置里没有任何输出路径（只有 $schema）。");
    }
    for (const draft of pathDraftList) {
        try {
            validatePathDraft(draft.path);
        } catch (error) {
            throw new Error(`导入失败：${describeError(error)}`);
        }
    }
    return pathDraftList;
}

/** 创建编辑器 store 与全部动作；所有变更均以不可变方式更新。 */
export function createEditorStore() {
    const [store, setStore] = createStore<EditorState>({
        paths: [],
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
                throw new Error(`输出路径已存在：${trimmed}`);
            }
            setStore("paths", pathList => [
                ...pathList,
                { path: trimmed, entries: [{ upstream: [], override: [] }] },
            ]);
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

        moveUpstream(path: string, entryIndex: number, row: number, direction: -1 | 1): void {
            updateEntry(path, entryIndex, entry => {
                const target = row + direction;
                if (target < 0 || target >= entry.upstream.length) return entry;
                return { ...entry, upstream: moveTo(entry.upstream, row, target) };
            });
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

        /** 为 upstream key 拉取内容；仅接受 http/https，失败状态留在 chip 上供粘贴兜底。 */
        async fetchSource(key: string): Promise<void> {
            if (key === "" || store.sourceStatus[key]?.state === "loading") return;
            if (!/^https?:\/\//i.test(key)) {
                setStore("sourceStatus", key, {
                    state: "failed",
                    error: "仅支持 http/https 地址；本地路径请用“粘贴内容”。",
                });
                return;
            }
            setStore("sourceStatus", key, { state: "loading" });
            try {
                const response = await fetch(key);
                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}${response.statusText === "" ? "" : ` ${response.statusText}`}`,
                    );
                }
                const text = await response.text();
                setStore("sources", key, text);
                setStore("sourceStatus", key, { state: "loaded" });
            } catch (error) {
                setStore("sourceStatus", key, { state: "failed", error: describeError(error) });
            }
        },

        /** 粘贴兜底：直接把内容写入 sources 并标记已加载。 */
        saveSource(key: string, text: string): void {
            setStore("sources", key, text);
            setStore("sourceStatus", key, { state: "loaded" });
        },
    };

    return { store, actions };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
