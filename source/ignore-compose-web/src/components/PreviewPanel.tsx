import { type Accessor, createMemo, createSignal, For, Show } from "solid-js";
import { copyText, describeError } from "../clipboard";
import { countLines } from "../store";
import type { ComposeConfig, ComposeOutput, PlanResult, StatusMessage } from "../types";
import {
    buttonClass,
    cardClass,
    errorBoxClass,
    hintClass,
    monoTextClass,
    noticeBoxClass,
    sectionTitleClass,
    tabActiveClass,
    tabInactiveClass,
} from "../ui";
import type { ComposeApi } from "../wasm/api";

type PanelResult<T> = { ok: true; data: T } | { ok: false; error: string };
type PanelTab = "plan" | "preview";

interface PreviewPanelProps {
    api: Accessor<ComposeApi | null>;
    apiError: Accessor<string>;
    config: Accessor<ComposeConfig>;
    sources: Accessor<Record<string, string>>;
    onStatus: (message: StatusMessage) => void;
}

/** 右侧结果面板：plan（每 path 将使用的 upstreams）与预览（compose 按 path 分节）双 Tab。 */
export function PreviewPanel(props: PreviewPanelProps) {
    const [tab, setTab] = createSignal<PanelTab>("plan");

    const planResult = createMemo<PanelResult<PlanResult> | null>(() => {
        if (tab() !== "plan") return null;
        const current = props.api();
        if (current === null) return null;
        try {
            return { ok: true, data: current.plan(props.config()) };
        } catch (caught) {
            return { ok: false, error: describeError(caught) };
        }
    });

    const composeResult = createMemo<PanelResult<ComposeOutput[]> | null>(() => {
        if (tab() !== "preview") return null;
        const current = props.api();
        if (current === null) return null;
        try {
            return { ok: true, data: current.compose(props.config(), props.sources()) };
        } catch (caught) {
            return { ok: false, error: describeError(caught) };
        }
    });

    async function copyOutput(output: ComposeOutput): Promise<void> {
        try {
            await copyText(output.content);
            props.onStatus({
                text: `已复制 ${output.path}（${countLines(output.content)} 行）到剪贴板。`,
                kind: "info",
            });
        } catch (caught) {
            props.onStatus({ text: describeError(caught), kind: "error" });
        }
    }

    return (
        <section class={cardClass} aria-label="结果面板">
            <div class="flex items-center justify-between gap-2">
                <h2 class={sectionTitleClass}>结果</h2>
                <div class="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                        type="button"
                        class={tab() === "plan" ? tabActiveClass : tabInactiveClass}
                        aria-pressed={tab() === "plan"}
                        onClick={() => setTab("plan")}
                    >
                        plan
                    </button>
                    <button
                        type="button"
                        class={tab() === "preview" ? tabActiveClass : tabInactiveClass}
                        aria-pressed={tab() === "preview"}
                        onClick={() => setTab("preview")}
                    >
                        预览
                    </button>
                </div>
            </div>
            <Show
                when={props.api() !== null}
                fallback={
                    <div class="mt-3 flex flex-col gap-2">
                        <p class={noticeBoxClass}>WebAssembly 模块未加载，无法计算结果。</p>
                        <Show when={props.apiError() !== ""}>
                            <p class={errorBoxClass}>加载失败原因：{props.apiError()}</p>
                        </Show>
                        <p class={hintClass}>
                            请确认已运行 bash script/ignore-compose.sh web，并通过 HTTP 服务以 dist
                            目录为根打开本页。
                        </p>
                    </div>
                }
            >
                <Show
                    when={tab() === "plan"}
                    fallback={
                        <PreviewOutputs composeResult={composeResult()} onCopy={copyOutput} />
                    }
                >
                    <PlanView planResult={planResult()} config={props.config()} />
                </Show>
            </Show>
        </section>
    );
}

function PlanView(props: { planResult: PanelResult<PlanResult> | null; config: ComposeConfig }) {
    return (
        <div class="mt-3 flex flex-col gap-3">
            <Show
                when={props.planResult !== null}
                fallback={<p class={hintClass}>切换到该页签时计算 plan。</p>}
            >
                <Show
                    when={props.planResult?.ok === true}
                    fallback={
                        <p class={errorBoxClass}>
                            plan 失败：
                            {props.planResult?.ok === false ? props.planResult.error : "未知错误。"}
                        </p>
                    }
                >
                    <div class="flex flex-col gap-1">
                        <h3 class={sectionTitleClass}>将生成的输出</h3>
                        <Show
                            when={
                                (props.planResult?.ok === true ? props.planResult.data.outputs : [])
                                    .length > 0
                            }
                            fallback={<p class={hintClass}>没有输出路径。</p>}
                        >
                            <ul class="flex flex-col gap-0.5">
                                <For
                                    each={
                                        props.planResult?.ok === true
                                            ? props.planResult.data.outputs
                                            : []
                                    }
                                >
                                    {path => <li class={monoTextClass}>{path}</li>}
                                </For>
                            </ul>
                        </Show>
                    </div>
                    <div class="flex flex-col gap-1">
                        <h3 class={sectionTitleClass}>将使用的 upstream（去重并排序）</h3>
                        <Show
                            when={
                                (props.planResult?.ok === true
                                    ? props.planResult.data.upstreams
                                    : []
                                ).length > 0
                            }
                            fallback={<p class={hintClass}>没有 upstream key。</p>}
                        >
                            <ul class="flex flex-col gap-0.5">
                                <For
                                    each={
                                        props.planResult?.ok === true
                                            ? props.planResult.data.upstreams
                                            : []
                                    }
                                >
                                    {key => <li class={monoTextClass}>{key}</li>}
                                </For>
                            </ul>
                        </Show>
                    </div>
                </Show>
            </Show>
            <div class="flex flex-col gap-1">
                <h3 class={sectionTitleClass}>每个 path 的 upstream 明细</h3>
                <For each={Object.entries(props.config)}>
                    {([path, entryList]) => (
                        <div class="rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700">
                            <p class={monoTextClass}>{path}</p>
                            <ul class="mt-1 flex flex-col gap-0.5">
                                <For each={entryList}>
                                    {(entry, index) => (
                                        <li class="text-xs text-slate-600 dark:text-slate-300">
                                            条目 {index() + 1}：
                                            <Show
                                                when={entry.upstream.length > 0}
                                                fallback={<span>纯自定义（只消费追加规则）</span>}
                                            >
                                                <span class="font-mono">
                                                    {entry.upstream.join(" + ")}
                                                </span>
                                            </Show>
                                            <Show when={entry.override.length > 0}>
                                                <span class="text-slate-500 dark:text-slate-400">
                                                    （{entry.override.length} 条规则）
                                                </span>
                                            </Show>
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}

function PreviewOutputs(props: {
    composeResult: PanelResult<ComposeOutput[]> | null;
    onCopy: (output: ComposeOutput) => void;
}) {
    return (
        <div class="mt-3 flex flex-col gap-3">
            <Show
                when={props.composeResult !== null}
                fallback={
                    <div class="flex flex-col gap-2">
                        <p class={hintClass}>切换到该页签时计算预览。</p>
                        <p class={hintClass}>
                            预览需要所有 upstream key 已加载内容（拉取或粘贴）。
                        </p>
                    </div>
                }
            >
                <Show
                    when={props.composeResult?.ok === true}
                    fallback={
                        <p class={errorBoxClass}>
                            生成失败：
                            {props.composeResult?.ok === false
                                ? props.composeResult.error
                                : "未知错误。"}
                        </p>
                    }
                >
                    <For each={props.composeResult?.ok === true ? props.composeResult.data : []}>
                        {output => (
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center justify-between gap-2">
                                    <h3 class={sectionTitleClass}>
                                        <span class="font-mono">{output.path}</span>
                                        <span class="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                                            {countLines(output.content)} 行
                                        </span>
                                    </h3>
                                    <button
                                        type="button"
                                        class={buttonClass("default")}
                                        onClick={() => props.onCopy(output)}
                                    >
                                        复制
                                    </button>
                                </div>
                                <pre class="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                                    <code class={`${monoTextClass} whitespace-pre-wrap`}>
                                        {output.content}
                                    </code>
                                </pre>
                            </div>
                        )}
                    </For>
                    <Show
                        when={
                            (props.composeResult?.ok === true ? props.composeResult.data : [])
                                .length === 0
                        }
                    >
                        <p class={hintClass}>没有输出：配置里还没有任何路径。</p>
                    </Show>
                </Show>
            </Show>
        </div>
    );
}
