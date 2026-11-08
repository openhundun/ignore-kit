import { type Accessor, Index } from "solid-js";
import type { EditorStore } from "../store";
import type { EntryDraft } from "../types";
import { hintClass, iconButtonClass, inputClass, sectionTitleClass } from "../ui";

interface RuleListProps {
    editor: EditorStore;
    path: string;
    entryIndex: number;
    entry: Accessor<EntryDraft>;
}

/** 条目的 override 规则列表：from/into 逐行编辑。from 空=追加、into 空=drop。 */
export function RuleList(props: RuleListProps) {
    return (
        <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
                <h4 class={sectionTitleClass}>override 规则</h4>
                <button
                    type="button"
                    class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => props.editor.actions.addRule(props.path, props.entryIndex)}
                >
                    添加规则
                </button>
            </div>
            <Index each={props.entry().override}>
                {(rule, row) => (
                    <div class="flex items-center gap-1">
                        <input
                            class={`${inputClass(true)} min-w-0 grow`}
                            type="text"
                            spellcheck={false}
                            placeholder="from：要匹配的原行；留空 = 追加 into 到末尾"
                            value={rule().from}
                            aria-label={`规则 ${row + 1} 的 from`}
                            onInput={event =>
                                props.editor.actions.updateRule(
                                    props.path,
                                    props.entryIndex,
                                    row,
                                    "from",
                                    event.currentTarget.value,
                                )
                            }
                        />
                        <input
                            class={`${inputClass(true)} min-w-0 grow`}
                            type="text"
                            spellcheck={false}
                            placeholder="into：替换为；留空 = 删除 from 命中的行"
                            value={rule().into}
                            aria-label={`规则 ${row + 1} 的 into`}
                            onInput={event =>
                                props.editor.actions.updateRule(
                                    props.path,
                                    props.entryIndex,
                                    row,
                                    "into",
                                    event.currentTarget.value,
                                )
                            }
                        />
                        <button
                            type="button"
                            class={iconButtonClass}
                            aria-label={`删除规则 ${row + 1}`}
                            title="删除该规则"
                            onClick={() =>
                                props.editor.actions.removeRule(props.path, props.entryIndex, row)
                            }
                        >
                            ✕
                        </button>
                    </div>
                )}
            </Index>
            <p class={hintClass}>
                语义：from 留空且 into 有值 = 在结果末尾追加一行 into；into 留空 = 删除 from
                精确命中的行；from 未命中任何行会报错；纯自定义条目只允许 from 留空。
            </p>
        </div>
    );
}
