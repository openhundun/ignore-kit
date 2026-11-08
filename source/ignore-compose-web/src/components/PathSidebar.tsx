import { createSignal, For, Show } from "solid-js";
import { describeError } from "../clipboard";
import type { EditorStore } from "../store";
import { buttonClass, cardClass, hintClass, iconButtonClass, sectionTitleClass } from "../ui";

interface PathSidebarProps {
    editor: EditorStore;
    activePath: string;
    onSelect: (path: string) => void;
}

/** 输出路径侧栏：列表高亮当前项、新增（输入文件名）、删除；空态给引导文案。 */
export function PathSidebar(props: PathSidebarProps) {
    const [draft, setDraft] = createSignal("");
    const [error, setError] = createSignal("");

    function submit(event: SubmitEvent): void {
        event.preventDefault();
        try {
            props.editor.actions.addPath(draft());
            setDraft("");
            setError("");
        } catch (caught) {
            setError(describeError(caught));
        }
    }

    function remove(path: string): void {
        props.editor.actions.removePath(path);
        setError("");
    }

    return (
        <aside class={cardClass}>
            <h2 class={sectionTitleClass}>输出路径</h2>
            <Show
                when={props.editor.store.paths.length > 0}
                fallback={
                    <p class={hintClass}>
                        暂无输出路径。在下方输入文件名添加第一个，例如 .gitignore。
                    </p>
                }
            >
                <ul class="mt-2 flex flex-col gap-1">
                    <For each={props.editor.store.paths}>
                        {draft => (
                            <li class="flex items-center gap-1">
                                <button
                                    type="button"
                                    class={
                                        draft.path === props.activePath
                                            ? "min-w-0 grow truncate rounded-md bg-sky-700 px-2 py-1 text-left font-mono text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:bg-sky-600"
                                            : "min-w-0 grow truncate rounded-md px-2 py-1 text-left font-mono text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                    }
                                    onClick={() => props.onSelect(draft.path)}
                                    title={draft.path}
                                >
                                    {draft.path}
                                </button>
                                <button
                                    type="button"
                                    class={iconButtonClass}
                                    aria-label={`删除路径 ${draft.path}`}
                                    title={`删除路径 ${draft.path}`}
                                    onClick={() => remove(draft.path)}
                                >
                                    ✕
                                </button>
                            </li>
                        )}
                    </For>
                </ul>
            </Show>
            <form class="mt-3 flex flex-col gap-1" onSubmit={submit}>
                <label
                    class="text-xs font-medium text-slate-600 dark:text-slate-300"
                    for="new-path"
                >
                    新增路径
                </label>
                <div class="flex items-center gap-1">
                    <input
                        id="new-path"
                        class="w-full min-w-0 grow rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                        type="text"
                        spellcheck={false}
                        placeholder="例如 .gitignore"
                        value={draft()}
                        onInput={event => setDraft(event.currentTarget.value)}
                    />
                    <button type="submit" class={buttonClass("primary")}>
                        添加
                    </button>
                </div>
                <Show when={error() !== ""}>
                    <p class="text-xs leading-4 text-red-700 dark:text-red-300" aria-live="polite">
                        {error()}
                    </p>
                </Show>
            </form>
        </aside>
    );
}
