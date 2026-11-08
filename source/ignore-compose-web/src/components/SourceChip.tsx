import { type Accessor, createSignal, Show } from "solid-js";
import { countLines, type EditorStore } from "../store";
import { type ChipState, chipClass, iconButtonClass } from "../ui";

interface SourceChipProps {
    editor: EditorStore;
    sourceKey: Accessor<string>;
}

/** 单个 upstream key 的内容状态 chip：未加载 / 加载中 / 已加载 N 行 / 失败（可粘贴兜底）。 */
export function SourceChip(props: SourceChipProps) {
    const [pasteOpen, setPasteOpen] = createSignal(false);
    const [pasteText, setPasteText] = createSignal("");

    const status = () => props.editor.store.sourceStatus[props.sourceKey()];
    const content = () => props.editor.store.sources[props.sourceKey()];
    const keyEmpty = () => props.sourceKey().trim() === "";

    function chipState(): ChipState {
        const current = status();
        if (keyEmpty()) return "neutral";
        if (!current || current.state === "idle") return "neutral";
        if (current.state === "loading") return "info";
        if (current.state === "loaded") return "success";
        return "danger";
    }

    function chipText(): string {
        const current = status();
        if (keyEmpty()) return "待填写 key";
        if (!current || current.state === "idle") return "未加载";
        if (current.state === "loading") return "加载中…";
        if (current.state === "loaded") return `已加载 ${countLines(content() ?? "")} 行`;
        return "加载失败";
    }

    function savePaste(event: SubmitEvent): void {
        event.preventDefault();
        const key = props.sourceKey().trim();
        if (key === "") return;
        props.editor.actions.saveSource(key, pasteText());
        setPasteOpen(false);
        setPasteText("");
    }

    return (
        <div class="flex min-w-0 flex-col gap-1">
            <div class="flex items-center gap-1">
                <span class={chipClass(chipState())}>{chipText()}</span>
                <button
                    type="button"
                    class={iconButtonClass}
                    disabled={keyEmpty() || status()?.state === "loading"}
                    onClick={() => props.editor.actions.fetchSource(props.sourceKey().trim())}
                    title="按当前 key 拉取内容"
                >
                    ⇩
                </button>
                <button
                    type="button"
                    class={iconButtonClass}
                    disabled={keyEmpty()}
                    onClick={() => setPasteOpen(value => !value)}
                    title="粘贴内容兜底"
                >
                    ⇥
                </button>
            </div>
            <Show when={status()?.state === "failed"}>
                <p
                    class="max-w-56 text-xs leading-4 text-red-700 dark:text-red-300"
                    aria-live="polite"
                >
                    {status()?.error ?? "拉取失败。"}
                </p>
            </Show>
            <Show when={pasteOpen() && !keyEmpty()}>
                <form class="flex flex-col gap-1" onSubmit={savePaste}>
                    <textarea
                        class="w-72 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        rows={4}
                        spellcheck={false}
                        placeholder="粘贴上游模板内容（例如 .gitignore 全文）"
                        value={pasteText()}
                        onInput={event => setPasteText(event.currentTarget.value)}
                    />
                    <button
                        type="submit"
                        class="self-start rounded-md bg-sky-700 px-2 py-1 text-xs font-medium text-white hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                    >
                        保存内容
                    </button>
                </form>
            </Show>
        </div>
    );
}
