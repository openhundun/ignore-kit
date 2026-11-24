import { createEffect, Index, on } from "solid-js";
import type { EntryDraft } from "../types";
import { iconButtonClass, tabActiveClass, tabClass, tabsClass } from "../ui";
import { Icon } from "./Icon";

interface EntryTabsProps {
    entries: readonly EntryDraft[];
    activeIndex: number;
    onSelect: (index: number) => void;
    onAdd: () => void;
    onRemove: () => void;
}

function entryLabel(entry: EntryDraft, index: number): string {
    const key = entry.upstream[0];
    if (key === undefined) return `Entry ${index + 1} · custom`;
    try {
        const name = new URL(key).pathname.split("/").filter(Boolean).pop();
        return `Entry ${index + 1} · ${(name ?? key).replace(/\.gitignore$/i, "")}`;
    } catch {
        return `Entry ${index + 1}`;
    }
}

/** 左侧纯 entry tab：切换、追加、删除当前条目；20+ 条时横向滚动。 */
export function EntryTabs(props: EntryTabsProps) {
    let scroller: HTMLDivElement | undefined;

    createEffect(
        on(
            () => `${props.activeIndex}:${props.entries.length}`,
            () => {
                queueMicrotask(() => {
                    scroller
                        ?.querySelector<HTMLElement>("[data-active=true]")
                        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
                });
            },
        ),
    );

    return (
        <div class={`${tabsClass} min-w-0`} role="tablist" aria-label="entries">
            <div
                ref={node => {
                    scroller = node;
                }}
                class="flex h-full min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <Index each={props.entries}>
                    {(entry, index) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={index === props.activeIndex}
                            data-active={index === props.activeIndex}
                            aria-label={entryLabel(entry(), index)}
                            title={entryLabel(entry(), index)}
                            class={index === props.activeIndex ? tabActiveClass : tabClass}
                            onClick={() => props.onSelect(index)}
                        >
                            {index + 1}
                        </button>
                    )}
                </Index>
            </div>
            <div class="flex h-full flex-none items-center gap-0.5 pr-1">
                <button
                    type="button"
                    class={iconButtonClass}
                    title="add entry"
                    aria-label="add entry"
                    onClick={props.onAdd}
                >
                    <Icon name="plus" size={13} />
                </button>
                <button
                    type="button"
                    class={iconButtonClass}
                    title="remove current entry"
                    aria-label="remove current entry"
                    disabled={props.entries.length <= 1}
                    onClick={props.onRemove}
                >
                    <Icon name="x" size={13} />
                </button>
            </div>
        </div>
    );
}
