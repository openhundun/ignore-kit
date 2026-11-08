import { type Accessor, Index, Show } from "solid-js";
import type { EditorStore } from "../store";
import type { EntryDraft } from "../types";
import { hintClass, iconButtonClass, inputClass, sectionTitleClass } from "../ui";
import { SourceChip } from "./SourceChip";

interface UpstreamListProps {
    editor: EditorStore;
    path: string;
    entryIndex: number;
    entry: Accessor<EntryDraft>;
}

/** 条目的 upstream key 列表：逐行编辑、增删与上下移排序，每行附内容状态 chip。 */
export function UpstreamList(props: UpstreamListProps) {
    return (
        <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
                <h4 class={sectionTitleClass}>upstream</h4>
                <button
                    type="button"
                    class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => props.editor.actions.addUpstream(props.path, props.entryIndex)}
                >
                    添加 key
                </button>
            </div>
            <Show when={props.entry().upstream.length === 0}>
                <p class={hintClass}>
                    upstream 列表为空：这是纯自定义条目，只在结果末尾追加下面规则里的 into 行。
                </p>
            </Show>
            <Index each={props.entry().upstream}>
                {(key, row) => (
                    <div class="flex flex-wrap items-start gap-1">
                        <div class="flex items-center gap-1">
                            <button
                                type="button"
                                class={iconButtonClass}
                                disabled={row === 0}
                                aria-label={`上移第 ${row + 1} 个 upstream key`}
                                title="上移（合并基底按列表顺序叠加）"
                                onClick={() =>
                                    props.editor.actions.moveUpstream(
                                        props.path,
                                        props.entryIndex,
                                        row,
                                        -1,
                                    )
                                }
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                class={iconButtonClass}
                                disabled={row === props.entry().upstream.length - 1}
                                aria-label={`下移第 ${row + 1} 个 upstream key`}
                                title="下移"
                                onClick={() =>
                                    props.editor.actions.moveUpstream(
                                        props.path,
                                        props.entryIndex,
                                        row,
                                        1,
                                    )
                                }
                            >
                                ↓
                            </button>
                        </div>
                        <input
                            class={`${inputClass(true)} min-w-0 grow`}
                            type="text"
                            spellcheck={false}
                            placeholder="https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore"
                            value={key()}
                            aria-label={`upstream key ${row + 1}`}
                            onInput={event =>
                                props.editor.actions.updateUpstream(
                                    props.path,
                                    props.entryIndex,
                                    row,
                                    event.currentTarget.value,
                                )
                            }
                        />
                        <SourceChip editor={props.editor} sourceKey={key} />
                        <button
                            type="button"
                            class={iconButtonClass}
                            aria-label={`删除 upstream key ${row + 1}`}
                            title="删除该行"
                            onClick={() =>
                                props.editor.actions.removeUpstream(
                                    props.path,
                                    props.entryIndex,
                                    row,
                                )
                            }
                        >
                            ✕
                        </button>
                    </div>
                )}
            </Index>
            <p class={hintClass}>
                多个 upstream 按列表顺序合并为一个基底后应用下方规则；再点击 key 行的 ⇩
                可拉取内容，失败时用 ⇥ 粘贴兜底。
            </p>
        </div>
    );
}
