import { createMemo, createSignal, Index, onMount, Show } from "solid-js";
import { copyText, describeError } from "./clipboard";
import { EntryCard } from "./components/EntryCard";
import { PathSidebar } from "./components/PathSidebar";
import { PreviewPanel } from "./components/PreviewPanel";
import { createEditorStore, parseConfig, serializeConfig } from "./store";
import type { ComposeConfig, StatusMessage } from "./types";
import { buttonClass, cardClass, hintClass, sectionTitleClass } from "./ui";
import { type ComposeApi, loadComposeApi } from "./wasm/api";

export function App() {
    const editor = createEditorStore();
    const [status, setStatus] = createSignal<StatusMessage>({ text: "", kind: "info" });
    const [api, setApi] = createSignal<ComposeApi | null>(null);
    const [apiError, setApiError] = createSignal("");
    const [selectedPath, setSelectedPath] = createSignal("");

    onMount(() => {
        loadComposeApi()
            .then(instance => {
                setApi(instance);
                setStatus({ text: "WebAssembly 模块已加载，plan 与预览可用。", kind: "info" });
            })
            .catch(error => {
                const message = describeError(error);
                setApiError(message);
                setStatus({
                    text: `WebAssembly 模块加载失败：${message}。请运行 bash script/ignore-compose.sh web，并通过 HTTP 服务以 dist 目录为根打开本页。`,
                    kind: "error",
                });
            });
    });

    const currentPath = createMemo(() => {
        const selected = selectedPath();
        if (editor.store.paths.some(draft => draft.path === selected)) return selected;
        return editor.store.paths[0]?.path ?? "";
    });

    const currentDraft = createMemo(() =>
        editor.store.paths.find(draft => draft.path === currentPath()),
    );

    const config = createMemo<ComposeConfig>(() =>
        Object.fromEntries(
            editor.store.paths.map(draft => [
                draft.path,
                draft.entries.map(entry => ({
                    upstream: [...entry.upstream],
                    override: entry.override.map(rule => ({ from: rule.from, into: rule.into })),
                })),
            ]),
        ),
    );

    const sources = () => editor.store.sources;

    function statusClass(): string {
        if (status().text === "") return "hidden";
        return status().kind === "error"
            ? "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            : "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }

    function requirePaths(): string | null {
        if (editor.store.paths.length === 0) {
            setStatus({ text: "当前没有任何输出路径，请先添加。", kind: "error" });
            return null;
        }
        return serializeConfig(editor.store.paths);
    }

    function exportConfig(): void {
        const text = requirePaths();
        if (text === null) return;
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "ignore-compose.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus({ text: "已发起 ignore-compose.json 下载。", kind: "info" });
    }

    async function copyConfigJson(): Promise<void> {
        const text = requirePaths();
        if (text === null) return;
        try {
            await copyText(text);
            setStatus({ text: "已复制 ignore-compose.json 内容到剪贴板。", kind: "info" });
        } catch (caught) {
            setStatus({ text: describeError(caught), kind: "error" });
        }
    }

    async function importConfigFile(event: Event): Promise<void> {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement)) return;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        try {
            const text = await file.text();
            const pathList = parseConfig(text);
            const currentApi = api();
            if (currentApi === null) {
                throw new Error("WebAssembly 模块尚未就绪，暂时无法校验导入配置。");
            }
            currentApi.plan(JSON.parse(text));
            editor.actions.replaceAllPaths(pathList);
            setSelectedPath(pathList[0]?.path ?? "");
            setStatus({ text: `导入成功：共 ${pathList.length} 个输出路径。`, kind: "info" });
        } catch (caught) {
            setStatus({ text: describeError(caught), kind: "error" });
        }
    }

    return (
        <>
            <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                    <div>
                        <h1 class="text-lg font-semibold">ignore-compose</h1>
                        <p class="text-sm text-slate-500 dark:text-slate-400">
                            合并上游 ignore 模板并应用覆盖规则，所有处理都在浏览器本地完成。
                        </p>
                    </div>
                    <div class="ml-auto flex items-center gap-2">
                        <input
                            id="import-config"
                            type="file"
                            accept="application/json,.json"
                            class="sr-only"
                            onChange={importConfigFile}
                        />
                        <label
                            for="import-config"
                            class={`${buttonClass("default")} cursor-pointer`}
                        >
                            导入 JSON
                        </label>
                        <button type="button" class={buttonClass("default")} onClick={exportConfig}>
                            下载 JSON
                        </button>
                        <button
                            type="button"
                            class={buttonClass("default")}
                            onClick={copyConfigJson}
                        >
                            复制 JSON
                        </button>
                    </div>
                </div>
                <div class="mx-auto max-w-7xl px-4 pb-3">
                    <p id="status" role="status" aria-live="polite" class={statusClass()}>
                        {status().text}
                    </p>
                </div>
            </header>
            <main class="mx-auto grid max-w-7xl items-start gap-4 px-4 py-6 xl:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1.1fr)]">
                <PathSidebar
                    editor={editor}
                    activePath={currentPath()}
                    onSelect={setSelectedPath}
                />
                <section class={cardClass} aria-label="条目编辑">
                    <div class="flex items-center justify-between gap-2">
                        <h2 class={sectionTitleClass}>
                            条目{" "}
                            <Show when={currentPath() !== ""}>
                                <span class="font-mono">{currentPath()}</span>
                            </Show>
                        </h2>
                        <button
                            type="button"
                            class={buttonClass("primary")}
                            disabled={currentPath() === ""}
                            onClick={() => editor.actions.addEntry(currentPath())}
                        >
                            添加条目
                        </button>
                    </div>
                    <Show
                        when={currentPath() !== ""}
                        fallback={
                            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                先在左侧添加一个输出路径，例如 .gitignore。
                            </p>
                        }
                    >
                        <Show
                            when={(currentDraft()?.entries.length ?? 0) > 0}
                            fallback={
                                <div class="mt-3 flex flex-col gap-1">
                                    <p class={hintClass}>
                                        该路径还没有条目。每个条目 = 若干 upstream 合并的基底 + 一组
                                        override 规则；upstream 留空即为纯自定义条目。
                                    </p>
                                </div>
                            }
                        >
                            <div class="mt-3 flex flex-col gap-3">
                                <Index each={currentDraft()?.entries ?? []}>
                                    {(entry, entryIndex) => (
                                        <EntryCard
                                            editor={editor}
                                            path={currentPath()}
                                            entryIndex={entryIndex}
                                            entry={entry}
                                        />
                                    )}
                                </Index>
                            </div>
                        </Show>
                    </Show>
                </section>
                <PreviewPanel
                    api={api}
                    apiError={apiError}
                    config={config}
                    sources={sources}
                    onStatus={setStatus}
                />
            </main>
        </>
    );
}
