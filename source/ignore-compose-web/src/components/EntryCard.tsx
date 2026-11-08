import { type Accessor, Show } from "solid-js";
import type { EditorStore } from "../store";
import type { EntryDraft } from "../types";
import { cardClass, iconButtonClass, sectionTitleClass } from "../ui";
import { RuleList } from "./RuleList";
import { UpstreamList } from "./UpstreamList";

interface EntryCardProps {
    editor: EditorStore;
    path: string;
    entryIndex: number;
    entry: Accessor<EntryDraft>;
}

/** 单个条目卡片：upstream 列表 + override 规则列表。 */
export function EntryCard(props: EntryCardProps) {
    const entryNo = props.entryIndex + 1;
    return (
        <article class={cardClass}>
            <div class="mb-2 flex items-center justify-between">
                <h3 class={sectionTitleClass}>条目 {entryNo}</h3>
                <button
                    type="button"
                    class={iconButtonClass}
                    aria-label={`删除条目 ${entryNo}`}
                    title="删除该条目"
                    onClick={() => props.editor.actions.removeEntry(props.path, props.entryIndex)}
                >
                    ✕
                </button>
            </div>
            <div class="flex flex-col gap-3">
                <UpstreamList
                    editor={props.editor}
                    path={props.path}
                    entryIndex={props.entryIndex}
                    entry={props.entry}
                />
                <RuleList
                    editor={props.editor}
                    path={props.path}
                    entryIndex={props.entryIndex}
                    entry={props.entry}
                />
            </div>
            <Show when={props.entry().upstream.length === 0 && props.entry().override.length === 0}>
                <p class="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    空条目不会产生任何内容：请添加 upstream key，或添加 from 留空的追加规则。
                </p>
            </Show>
        </article>
    );
}
