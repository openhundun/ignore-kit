import { createEffect, createMemo, createSignal, on, onMount, Show } from "solid-js";
import { copyText, describeError } from "./clipboard";
import { AppBar } from "./components/AppBar";
import { EntryTabs } from "./components/EntryTabs";
import { FileEditor } from "./components/FileEditor";
import { FormView } from "./components/FormView";
import { PreviewView } from "./components/PreviewView";
import { StatusToast } from "./components/StatusToast";
import { createEditorStore, parseConfig, serializeConfig } from "./store";
import type {
    ComposeConfig,
    ComposeOutput,
    PreviewResult,
    Selection,
    StatusMessage,
} from "./types";
import { focusLast, panelBodyClass, tabActiveClass, tabClass, tabsClass } from "./ui";
import { type ComposeApi, loadComposeApi } from "./wasm/api";

type RightTab = "config" | "preview";

export function App() {
    const editor = createEditorStore();
    const [status, setStatus] = createSignal<StatusMessage>({ text: "", kind: "info" });
    const [api, setApi] = createSignal<ComposeApi | null>(null);
    const [rightTab, setRightTab] = createSignal<RightTab>("preview");
    const [activePath, setActivePath] = createSignal(editor.store.paths[0]?.path ?? "");
    const [activeEntry, setActiveEntry] = createSignal(0);
    const [selection, setSelection] = createSignal<Selection | null>(null);

    let statusTimer: number | undefined;

    function showStatus(message: StatusMessage): void {
        setStatus(message);
        clearTimeout(statusTimer);
        if (message.text === "") return;
        statusTimer = window.setTimeout(() => setStatus({ text: "", kind: "info" }), 2400);
    }

    onMount(() => {
        loadComposeApi()
            .then(instance => setApi(instance))
            .catch(error => {
                const message = describeError(error);
                showStatus({
                    text: `WebAssembly module failed to load: ${message}`,
                    kind: "error",
                });
            });
    });

    const currentPath = createMemo(() => {
        const selected = activePath();
        if (editor.store.paths.some(draft => draft.path === selected)) return selected;
        return editor.store.paths[0]?.path ?? "";
    });

    const currentDraft = createMemo(() =>
        editor.store.paths.find(draft => draft.path === currentPath()),
    );

    const entryIndex = createMemo(() => {
        const count = currentDraft()?.entries.length ?? 0;
        return count === 0 ? 0 : Math.min(Math.max(activeEntry(), 0), count - 1);
    });

    const currentEntry = createMemo(() => currentDraft()?.entries[entryIndex()]);

    const composeResult = createMemo<PreviewResult>(() => {
        const instance = api();
        const path = currentPath();
        const draft = currentDraft();
        if (instance === null || path === "" || draft === undefined) return null;
        if (
            draft.entries.every(entry => entry.upstream.length === 0 && entry.override.length === 0)
        ) {
            return { ok: true, content: "" };
        }
        try {
            const config: ComposeConfig = {
                [path]: draft.entries.map(entry => ({
                    upstream: [...entry.upstream],
                    override: entry.override.map(rule => ({ from: rule.from, into: rule.into })),
                })),
            };
            const outputs: ComposeOutput[] = instance.composePreview(config, editor.store.sources);
            return { ok: true, content: outputs[0]?.content ?? "" };
        } catch (caught) {
            return { ok: false, error: describeError(caught) };
        }
    });

    createEffect(
        on([currentPath, entryIndex], () => {
            setSelection(null);
        }),
    );

    function configText(): string {
        return serializeConfig(editor.store.paths);
    }

    function applyConfigText(text: string): void {
        const pathList = parseConfig(text);
        const instance = api();
        if (instance !== null) {
            instance.plan(JSON.parse(text) as ComposeConfig);
        }
        editor.actions.replaceAllPaths(pathList);
        const names = pathList.map(draft => draft.path);
        setActivePath(names.includes(activePath()) ? activePath() : (names[0] ?? ""));
        setSelection(null);
    }

    async function importConfigFile(event: Event): Promise<void> {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement)) return;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        try {
            applyConfigText(await file.text());
            setActiveEntry(0);
            const keys = [
                ...new Set(
                    editor.store.paths
                        .flatMap(draft => draft.entries.flatMap(entry => entry.upstream))
                        .map(key => key.trim())
                        .filter(key => key !== "" && editor.store.sources[key] === undefined),
                ),
            ];
            if (keys.length === 0) {
                showStatus({ text: "Imported", kind: "info" });
                return;
            }
            showStatus({ text: `Imported; loading ${keys.length} sources`, kind: "info" });
            const results = await Promise.allSettled(
                keys.map(key => editor.actions.fetchSource(key)),
            );
            const failed = results.filter(result => result.status === "rejected").length;
            showStatus({
                text:
                    failed === 0
                        ? `Imported; loaded ${keys.length} sources`
                        : `Imported; ${failed}/${keys.length} sources failed`,
                kind: failed === 0 ? "info" : "error",
            });
        } catch (caught) {
            showStatus({ text: describeError(caught), kind: "error" });
        }
    }

    function downloadConfig(): void {
        const url = URL.createObjectURL(new Blob([configText()], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "ignore-compose.json";
        anchor.click();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
        showStatus({ text: "Downloaded", kind: "info" });
    }

    async function copyConfigJson(): Promise<void> {
        try {
            await copyText(configText());
            showStatus({ text: "Copied", kind: "info" });
        } catch (caught) {
            showStatus({ text: describeError(caught), kind: "error" });
        }
    }

    async function fetchSource(key: string): Promise<void> {
        try {
            await editor.actions.fetchSource(key);
            showStatus({ text: `Loaded ${key}`, kind: "info" });
        } catch (caught) {
            showStatus({ text: describeError(caught), kind: "error" });
        }
    }

    function selectPath(path: string): void {
        setActivePath(path);
        setActiveEntry(0);
        setSelection(null);
    }

    function addPath(): void {
        const used = new Set(editor.store.paths.map(draft => draft.path));
        let index = 1;
        let next = ".ignore";
        while (used.has(next)) {
            index += 1;
            next = `.ignore-${index}`;
        }
        editor.actions.addPath(next);
        setActivePath(next);
        setActiveEntry(0);
        focusLast("sink");
    }

    function removePath(path: string): void {
        editor.actions.removePath(path);
        if (editor.store.paths.length === 0) {
            editor.actions.addPath(".gitignore");
        }
        const remaining = editor.store.paths.map(draft => draft.path);
        if (!remaining.includes(activePath())) {
            setActivePath(remaining[0] ?? "");
        }
        setActiveEntry(0);
    }

    function renamePath(path: string, nextPath: string): void {
        editor.actions.renamePath(path, nextPath);
        if (activePath() === path) {
            setActivePath(nextPath.trim());
        }
    }

    function addEntry(): void {
        const path = currentPath();
        editor.actions.addEntry(path);
        const count = editor.store.paths.find(draft => draft.path === path)?.entries.length ?? 1;
        setActiveEntry(count - 1);
    }

    function removeEntry(): void {
        const path = currentPath();
        const index = entryIndex();
        editor.actions.removeEntry(path, index);
        const count = editor.store.paths.find(draft => draft.path === path)?.entries.length ?? 0;
        setActiveEntry(Math.max(0, Math.min(index, count - 1)));
    }

    return (
        <>
            <AppBar
                onImport={importConfigFile}
                onDownload={downloadConfig}
                onCopy={copyConfigJson}
            />
            <main class="grid min-h-0 flex-1 grid-cols-2 overflow-hidden max-[960px]:grid-cols-1 max-[960px]:grid-rows-2">
                <section
                    class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#e8e8ed] max-[960px]:border-r-0 max-[960px]:border-b"
                    aria-label="editor"
                >
                    <EntryTabs
                        entries={currentDraft()?.entries ?? []}
                        activeIndex={entryIndex()}
                        onSelect={setActiveEntry}
                        onAdd={addEntry}
                        onRemove={removeEntry}
                    />
                    <div class={panelBodyClass}>
                        <FormView
                            editor={editor}
                            path={currentPath()}
                            entry={currentEntry()}
                            selection={selection()}
                            onSelect={setSelection}
                            onSelectPath={selectPath}
                            onAddPath={addPath}
                            onRemovePath={removePath}
                            onRenamePath={renamePath}
                            onFetch={fetchSource}
                            onStatus={showStatus}
                        />
                    </div>
                </section>
                <section
                    class="flex min-h-0 min-w-0 flex-col overflow-hidden"
                    aria-label="config and preview"
                >
                    <div class={tabsClass} role="tablist" aria-label="config and preview">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={rightTab() === "config"}
                            class={rightTab() === "config" ? tabActiveClass : tabClass}
                            onClick={() => setRightTab("config")}
                        >
                            Config
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={rightTab() === "preview"}
                            class={rightTab() === "preview" ? tabActiveClass : tabClass}
                            onClick={() => setRightTab("preview")}
                        >
                            Preview
                        </button>
                    </div>
                    <div class={panelBodyClass}>
                        <Show
                            when={rightTab() === "config"}
                            fallback={
                                <PreviewView
                                    path={currentPath()}
                                    entry={currentEntry()}
                                    entries={currentDraft()?.entries ?? []}
                                    selection={selection()}
                                    sources={editor.store.sources}
                                    statuses={editor.store.sourceStatus}
                                    result={composeResult()}
                                />
                            }
                        >
                            <FileEditor text={configText()} apply={applyConfigText} />
                        </Show>
                    </div>
                </section>
            </main>
            <StatusToast message={status()} />
        </>
    );
}
