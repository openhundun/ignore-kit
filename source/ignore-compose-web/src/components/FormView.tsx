import { Index, Show } from "solid-js";
import { describeError } from "../clipboard";
import type { EditorStore } from "../store";
import type { EntryDraft, Selection, StatusMessage } from "../types";
import {
    cardAddButtonClass,
    focusLast,
    formCardBodyClass,
    formCardClass,
    formCardHeadClass,
    formCardTitleClass,
    formGridClass,
    iconButtonBusyClass,
    iconButtonClass,
    iconButtonDangerClass,
    monoInputClass,
    mutedTextClass,
    rowArrowClass,
    rowClass,
    ruleRowClass,
    selectDotActiveClass,
    selectDotClass,
    selectedRowClass,
    selectHandleSlotClass,
} from "../ui";
import { Icon } from "./Icon";

interface FormViewProps {
    editor: EditorStore;
    path: string;
    entry: EntryDraft | undefined;
    selection: Selection | null;
    onSelect: (selection: Selection | null) => void;
    onSelectPath: (path: string) => void;
    onAddPath: () => void;
    onRemovePath: (path: string) => void;
    onRenamePath: (path: string, nextPath: string) => void;
    onFetch: (key: string) => void;
    onStatus: (message: StatusMessage) => void;
}

/** Form 页：source / transform / sink 三张卡片；编辑当前路径的第一个 entry。 */
export function FormView(props: FormViewProps) {
    return (
        <div class={formGridClass}>
            <SourceCard
                editor={props.editor}
                path={props.path}
                entry={props.entry}
                selection={props.selection}
                onSelect={props.onSelect}
                onFetch={props.onFetch}
            />
            <TransformCard
                editor={props.editor}
                path={props.path}
                entry={props.entry}
                selection={props.selection}
                onSelect={props.onSelect}
            />
            <SinkCard
                editor={props.editor}
                path={props.path}
                onSelectPath={props.onSelectPath}
                onAddPath={props.onAddPath}
                onRemovePath={props.onRemovePath}
                onRenamePath={props.onRenamePath}
                onStatus={props.onStatus}
            />
        </div>
    );
}

interface SourceCardProps {
    editor: EditorStore;
    path: string;
    entry: EntryDraft | undefined;
    selection: Selection | null;
    onSelect: (selection: Selection | null) => void;
    onFetch: (key: string) => void;
}

function SourceCard(props: SourceCardProps) {
    return (
        <section class={formCardClass} aria-label="source">
            <div class={formCardHeadClass}>
                <span class={formCardTitleClass}>source</span>
                <button
                    type="button"
                    class={cardAddButtonClass}
                    title="add source"
                    aria-label="add source"
                    disabled={props.entry === undefined}
                    onClick={() => {
                        props.editor.actions.addUpstream(props.path, 0);
                        focusLast("source");
                    }}
                >
                    <Icon name="plus" size={14} />
                </button>
            </div>
            <div class={formCardBodyClass}>
                <Index each={props.entry?.upstream ?? []}>
                    {(source, index) => {
                        const status = () => props.editor.store.sourceStatus[source().trim()];
                        const selected = () =>
                            props.selection?.type === "source" && props.selection.index === index;
                        const key = () => source().trim();

                        return (
                            <div class="flex flex-col gap-1">
                                <div class={`${rowClass} ${selected() ? selectedRowClass : ""}`}>
                                    <button
                                        type="button"
                                        class={selectHandleSlotClass}
                                        aria-pressed={selected()}
                                        aria-label={`select source ${index + 1}`}
                                        onClick={() =>
                                            props.onSelect(
                                                selected() ? null : { type: "source", index },
                                            )
                                        }
                                    >
                                        <span
                                            class={
                                                selected() ? selectDotActiveClass : selectDotClass
                                            }
                                        />
                                    </button>
                                    <input
                                        class={monoInputClass}
                                        data-focus-group="source"
                                        value={source()}
                                        spellcheck={false}
                                        autocomplete="off"
                                        aria-label={`source ${index + 1}`}
                                        onInput={event =>
                                            props.editor.actions.updateUpstream(
                                                props.path,
                                                0,
                                                index,
                                                event.currentTarget.value,
                                            )
                                        }
                                        onChange={event => {
                                            const next = event.currentTarget.value.trim();
                                            const state = props.editor.store.sourceStatus[next];
                                            if (
                                                next !== "" &&
                                                state === undefined &&
                                                /^https?:\/\//i.test(next)
                                            ) {
                                                props.onFetch(next);
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        class={
                                            status()?.state === "loading"
                                                ? iconButtonBusyClass
                                                : status()?.state === "failed"
                                                  ? iconButtonDangerClass
                                                  : iconButtonClass
                                        }
                                        title={
                                            status()?.state === "failed" ? status()?.error : "fetch"
                                        }
                                        aria-label={`fetch source ${index + 1}`}
                                        disabled={key() === "" || status()?.state === "loading"}
                                        onClick={() => props.onFetch(key())}
                                    >
                                        <Icon name="fetch" size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        class={iconButtonClass}
                                        title="remove"
                                        aria-label={`remove source ${index + 1}`}
                                        onClick={() => {
                                            props.editor.actions.removeUpstream(
                                                props.path,
                                                0,
                                                index,
                                            );
                                        }}
                                    >
                                        <Icon name="x" size={13} />
                                    </button>
                                </div>
                                <Show when={status()?.state === "failed"}>
                                    <p class="px-1 text-[11px] leading-4 text-[#b42318]">
                                        {status()?.error ?? "Fetch failed."}
                                    </p>
                                </Show>
                            </div>
                        );
                    }}
                </Index>
            </div>
        </section>
    );
}

interface TransformCardProps {
    editor: EditorStore;
    path: string;
    entry: EntryDraft | undefined;
    selection: Selection | null;
    onSelect: (selection: Selection | null) => void;
}

function TransformCard(props: TransformCardProps) {
    return (
        <section class={formCardClass} aria-label="transform">
            <div class={formCardHeadClass}>
                <span class={formCardTitleClass}>transform</span>
                <button
                    type="button"
                    class={cardAddButtonClass}
                    title="add transform"
                    aria-label="add transform"
                    disabled={props.entry === undefined}
                    onClick={() => {
                        props.editor.actions.addRule(props.path, 0);
                        focusLast("transform");
                    }}
                >
                    <Icon name="plus" size={14} />
                </button>
            </div>
            <div class={formCardBodyClass}>
                <Index each={props.entry?.override ?? []}>
                    {(rule, index) => {
                        const selected = () =>
                            props.selection?.type === "transform" &&
                            props.selection.index === index;

                        return (
                            <div class={`${ruleRowClass} ${selected() ? selectedRowClass : ""}`}>
                                <button
                                    type="button"
                                    class={selectHandleSlotClass}
                                    aria-pressed={selected()}
                                    aria-label={`select transform ${index + 1}`}
                                    onClick={() =>
                                        props.onSelect(
                                            selected() ? null : { type: "transform", index },
                                        )
                                    }
                                >
                                    <span
                                        class={selected() ? selectDotActiveClass : selectDotClass}
                                    />
                                </button>
                                <input
                                    class={monoInputClass}
                                    data-focus-group="transform"
                                    value={rule().from}
                                    spellcheck={false}
                                    autocomplete="off"
                                    aria-label="from"
                                    onInput={event =>
                                        props.editor.actions.updateRule(
                                            props.path,
                                            0,
                                            index,
                                            "from",
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                                <span class={rowArrowClass}>
                                    <Icon name="arrow" size={13} />
                                </span>
                                <input
                                    class={monoInputClass}
                                    value={rule().into}
                                    spellcheck={false}
                                    autocomplete="off"
                                    aria-label="into"
                                    onInput={event =>
                                        props.editor.actions.updateRule(
                                            props.path,
                                            0,
                                            index,
                                            "into",
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                                <button
                                    type="button"
                                    class={iconButtonClass}
                                    title="remove"
                                    aria-label={`remove transform ${index + 1}`}
                                    onClick={() =>
                                        props.editor.actions.removeRule(props.path, 0, index)
                                    }
                                >
                                    <Icon name="x" size={13} />
                                </button>
                            </div>
                        );
                    }}
                </Index>
            </div>
        </section>
    );
}

interface SinkCardProps {
    editor: EditorStore;
    path: string;
    onSelectPath: (path: string) => void;
    onAddPath: () => void;
    onRemovePath: (path: string) => void;
    onRenamePath: (path: string, nextPath: string) => void;
    onStatus: (message: StatusMessage) => void;
}

function SinkCard(props: SinkCardProps) {
    return (
        <section class={formCardClass} aria-label="sink">
            <div class={formCardHeadClass}>
                <span class={formCardTitleClass}>sink</span>
                <button
                    type="button"
                    class={cardAddButtonClass}
                    title="add sink"
                    aria-label="add sink"
                    onClick={props.onAddPath}
                >
                    <Icon name="plus" size={14} />
                </button>
            </div>
            <div class={formCardBodyClass}>
                <Show
                    when={props.editor.store.paths.length > 0}
                    fallback={<p class={mutedTextClass}>No output files.</p>}
                >
                    <Index each={props.editor.store.paths}>
                        {draft => (
                            <div
                                class={`${rowClass} ${
                                    draft().path === props.path ? selectedRowClass : ""
                                }`}
                            >
                                <button
                                    type="button"
                                    class={selectHandleSlotClass}
                                    aria-pressed={draft().path === props.path}
                                    aria-label={`select file ${draft().path}`}
                                    onClick={() => props.onSelectPath(draft().path)}
                                >
                                    <span
                                        class={
                                            draft().path === props.path
                                                ? selectDotActiveClass
                                                : selectDotClass
                                        }
                                    />
                                </button>
                                <input
                                    class={monoInputClass}
                                    data-focus-group="sink"
                                    value={draft().path}
                                    spellcheck={false}
                                    autocomplete="off"
                                    aria-label={`output file ${draft().path}`}
                                    onChange={event => {
                                        const input = event.currentTarget;
                                        try {
                                            props.onRenamePath(draft().path, input.value);
                                        } catch (caught) {
                                            input.value = draft().path;
                                            props.onStatus({
                                                text: describeError(caught),
                                                kind: "error",
                                            });
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    class={iconButtonClass}
                                    title="remove"
                                    aria-label={`remove file ${draft().path}`}
                                    onClick={() => props.onRemovePath(draft().path)}
                                >
                                    <Icon name="x" size={13} />
                                </button>
                            </div>
                        )}
                    </Index>
                </Show>
            </div>
        </section>
    );
}
