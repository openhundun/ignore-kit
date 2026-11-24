import { createMemo, Index, Show } from "solid-js";
import type { EntryDraft, OverrideDraft, PreviewResult, Selection, SourceStatus } from "../types";
import { formCardHeadClass, outputBodyClass, outputCardClass } from "../ui";
import { FolderIcon } from "./Icon";

interface PreviewViewProps {
    path: string;
    entry: EntryDraft | undefined;
    entries: readonly EntryDraft[];
    selection: Selection | null;
    sources: Record<string, string>;
    statuses: Record<string, SourceStatus>;
    result: PreviewResult;
}

/** 右侧 Preview：始终按只读编辑器渲染 compose 结果；行号 3 位 + 1 位图标。 */
export function PreviewView(props: PreviewViewProps) {
    const sourceKeys = createMemo(() => [
        ...new Set(
            props.entries
                .flatMap(entry => entry.upstream)
                .map(key => key.trim())
                .filter(key => key !== ""),
        ),
    ]);

    const loadedCount = createMemo(
        () => sourceKeys().filter(key => props.sources[key] !== undefined).length,
    );

    const failedCount = createMemo(
        () => sourceKeys().filter(key => props.statuses[key]?.state === "failed").length,
    );

    const highlighted = createMemo<Set<string> | null>(() => {
        const selection = props.selection;
        const entry = props.entry;
        if (selection === null || entry === undefined) return null;
        if (selection.type === "transform") {
            const rule = entry.override[selection.index];
            return rule === undefined || rule.into === "" ? null : new Set([rule.into]);
        }
        const key = entry.upstream[selection.index]?.trim();
        const text = key === undefined ? undefined : props.sources[key];
        return text === undefined ? null : sourceLines(text, entry.override);
    });

    const content = () => (props.result?.ok === true ? props.result.content : "");

    return (
        <section class={outputCardClass} aria-label="preview">
            <div class={formCardHeadClass}>
                <span class="min-w-0 truncate pl-1 text-[12px] font-semibold tracking-[0.02em] text-[#424245]">
                    {props.path}
                </span>
                <Show
                    when={
                        sourceKeys().length > 0 &&
                        (loadedCount() < sourceKeys().length || failedCount() > 0)
                    }
                >
                    <span class="ml-auto flex flex-none items-center gap-1 text-[11px] text-[#86868b]">
                        <Show when={failedCount() > 0}>
                            <span
                                class="size-1.5 rounded-full bg-[#dc2626]"
                                title={`${failedCount()} sources failed`}
                            />
                        </Show>
                        {loadedCount()}/{sourceKeys().length}
                    </span>
                </Show>
            </div>
            <div class={outputBodyClass}>
                <CodeBlock content={content()} highlight={highlighted()} />
            </div>
        </section>
    );
}

/** 复刻原型 getSourceContribution：源模板去注释后，按该 entry 的规则替换/删除，得到贡献行集合。 */
function sourceLines(text: string, rules: readonly OverrideDraft[]): Set<string> {
    let lines = text
        .split(/\r?\n/)
        .map(line => line.replace(/[ \t\r]+$/, ""))
        .filter(line => line !== "" && !line.startsWith("#"));
    for (const rule of rules) {
        if (rule.from === "" || !lines.includes(rule.from)) continue;
        lines =
            rule.into === ""
                ? lines.filter(line => line !== rule.from)
                : lines.map(line => (line === rule.from ? rule.into : line));
    }
    return new Set(lines);
}

function toLines(content: string): string[] {
    if (content === "") return [""];
    return content.endsWith("\n") ? content.slice(0, -1).split("\n") : content.split("\n");
}

interface CodeBlockProps {
    content: string;
    highlight: Set<string> | null;
}

function CodeBlock(props: CodeBlockProps) {
    const lines = createMemo(() => toLines(props.content));
    const isHighlighted = (line: string): boolean =>
        props.highlight !== null && line !== "" && props.highlight.has(line);

    return (
        <div class="flex min-h-full font-mono text-[12px] leading-[1.55]">
            <div class="flex-none bg-[#f2f2f4] px-1 py-1 text-[#86868b] select-none">
                <Index each={lines()}>
                    {(line, index) => (
                        <div class="flex h-[1.55em] items-center justify-end gap-1">
                            <span class="w-6 text-right">{index + 1}</span>
                            <span class="inline-flex w-3.5 justify-center">
                                {line().endsWith("/") ? <FolderIcon /> : null}
                            </span>
                        </div>
                    )}
                </Index>
            </div>
            <div class="min-w-0 flex-1 py-1">
                <Index each={lines()}>
                    {line => (
                        <div
                            class={`flex min-h-[1.55em] items-center whitespace-pre-wrap break-words pl-1 pr-1 ${
                                isHighlighted(line())
                                    ? "bg-[rgba(0,113,227,0.16)] shadow-[inset_3px_0_0_0_#0071e3]"
                                    : ""
                            }`}
                        >
                            {line() === "" ? "\u00a0" : line()}
                        </div>
                    )}
                </Index>
            </div>
        </div>
    );
}
