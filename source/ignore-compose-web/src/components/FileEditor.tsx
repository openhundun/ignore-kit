import { createEffect, createMemo, createSignal, Index, on, Show } from "solid-js";
import { describeError } from "../clipboard";
import { formCardHeadClass, formCardTitleClass } from "../ui";
import { Icon } from "./Icon";

interface FileEditorProps {
    text: string;
    apply: (text: string) => void;
}

/** Config 页：ignore-compose.json 原文编辑，带行号与解析错误行；Form 侧变化时同步。 */
export function FileEditor(props: FileEditorProps) {
    const [text, setText] = createSignal(props.text);
    const [error, setError] = createSignal("");
    const lines = createMemo(() => text().split("\n"));
    let gutter: HTMLDivElement | undefined;
    let textarea: HTMLTextAreaElement | undefined;

    createEffect(
        on(
            () => props.text,
            value => {
                if (document.activeElement === textarea) return;
                setText(value);
                setError("");
            },
        ),
    );

    function syncScroll(): void {
        if (gutter !== undefined && textarea !== undefined) {
            gutter.scrollTop = textarea.scrollTop;
        }
    }

    function update(value: string): void {
        setText(value);
        try {
            props.apply(value);
            setError("");
        } catch (caught) {
            setError(describeError(caught));
        }
    }

    function foldable(line: string): boolean {
        const trimmed = line.trimEnd();
        return trimmed.endsWith("{") || trimmed.endsWith("[");
    }

    return (
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d2d2d7] bg-[#fbfbfd]">
            <div class={formCardHeadClass}>
                <span class={formCardTitleClass}>ignore-compose.json</span>
            </div>
            <div class="flex min-h-0 flex-1 overflow-hidden">
                <div
                    ref={node => {
                        gutter = node;
                    }}
                    class="w-14 flex-none overflow-hidden bg-[#f2f2f4] px-1 py-1 font-mono text-[12px] leading-[1.55] text-[#86868b] select-none"
                >
                    <Index each={lines()}>
                        {(line, index) => (
                            <div class="flex h-[1.55em] items-center justify-end gap-1">
                                <span class="w-6 text-right">{index + 1}</span>
                                <span class="inline-flex w-3 justify-center">
                                    <Show when={foldable(line())}>
                                        <Icon name="down" size={11} />
                                    </Show>
                                </span>
                            </div>
                        )}
                    </Index>
                </div>
                <textarea
                    ref={node => {
                        textarea = node;
                    }}
                    class="min-h-0 min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-[#fbfbfd] p-1 font-mono text-[12px] leading-[1.55] text-[#1d1d1f] outline-none [scrollbar-width:none] focus:shadow-[inset_0_0_0_1px_#0071e3] [&::-webkit-scrollbar]:hidden"
                    wrap="off"
                    spellcheck={false}
                    aria-label="ignore-compose.json"
                    value={text()}
                    onInput={event => update(event.currentTarget.value)}
                    onScroll={syncScroll}
                />
            </div>
            <Show when={error() !== ""}>
                <p class="px-3 py-2 text-[12px] leading-5 text-[#b42318]">{error()}</p>
            </Show>
        </div>
    );
}
