/** 共享的 Tailwind 工具类组合；只做字符串复用，不含任何自定义 CSS。 */

export const cardClass =
    "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

export const hintClass = "mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400";

export const sectionTitleClass = "text-sm font-semibold text-slate-700 dark:text-slate-200";

export type ButtonKind = "primary" | "default" | "danger";

const buttonBase =
    "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-1 dark:focus-visible:ring-sky-400 dark:focus-visible:ring-offset-slate-900";

const buttonKindClassMap: Record<ButtonKind, string> = {
    primary: "bg-sky-700 text-white hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500",
    default:
        "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950",
};

export function buttonClass(kind: ButtonKind = "default"): string {
    return `${buttonBase} ${buttonKindClassMap[kind]}`;
}

/** 小方形图标按钮（行内 ↑ ↓ ✕）。 */
export const iconButtonClass =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

export function inputClass(mono: boolean): string {
    return `w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500${mono ? " font-mono" : ""}`;
}

export type ChipState = "neutral" | "info" | "success" | "danger";

const chipStateClassMap: Record<ChipState, string> = {
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function chipClass(state: ChipState): string {
    return `inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${chipStateClassMap[state]}`;
}

export const tabActiveClass =
    "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100";

export const tabInactiveClass =
    "rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";

export const errorBoxClass =
    "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

export const noticeBoxClass =
    "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";

export const monoTextClass = "font-mono text-xs leading-5 break-all";
