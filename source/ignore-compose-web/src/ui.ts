/** 11-23 原型的设计 token，全部以 Tailwind 工具类表达；不含自定义 CSS 与 style 属性。 */

const focusRing = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/35";

const hiddenScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const appBarClass =
    "flex h-[54px] flex-none items-center gap-3 border-b border-[#e8e8ed] bg-white px-4 max-[640px]:h-auto max-[640px]:min-h-12 max-[640px]:flex-wrap max-[640px]:px-3 max-[640px]:py-2";

export const brandClass = "m-0 font-mono text-[14px] font-semibold tracking-[-0.02em]";

export const appActionsClass = "ml-auto flex items-center gap-1.5";

export const buttonClass = `inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[#d2d2d7] bg-white px-2.5 text-[12px] font-medium text-[#1d1d1f] transition-colors hover:border-[#86868b] hover:bg-[#f5f5f7] disabled:cursor-default disabled:opacity-35 ${focusRing}`;

const iconButtonBase = `inline-grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-md border border-transparent transition-colors hover:bg-[#f5f5f7] disabled:cursor-default disabled:opacity-35 ${focusRing}`;

export const iconButtonClass = `${iconButtonBase} text-[#86868b] hover:text-[#1d1d1f]`;

export const iconButtonBusyClass = `${iconButtonBase} animate-pulse text-[#0071e3]`;

export const iconButtonDangerClass = `${iconButtonBase} text-[#dc2626] hover:text-[#dc2626]`;

export const cardAddButtonClass = `ml-auto inline-grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-md text-[#86868b] transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:cursor-default disabled:opacity-35 ${focusRing}`;

export const inputClass = `h-7 w-full min-w-0 rounded-md border border-[#d2d2d7] bg-white px-2 py-1 text-[12.5px] text-[#1d1d1f] transition-colors hover:border-[#86868b] focus-visible:border-[#0071e3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/35`;

export const monoInputClass = `${inputClass} font-mono text-[12px]`;

export const tabsClass = "flex h-[30px] flex-none border-b border-[#e8e8ed]";

const tabBase =
    "flex h-full flex-none items-center border-b-2 px-3.5 text-[13px] font-medium transition-colors";

export const tabClass = `${tabBase} cursor-pointer border-transparent text-[#6e6e73] hover:text-[#1d1d1f]`;

export const tabActiveClass = `${tabBase} cursor-pointer border-[#0071e3] text-[#1d1d1f]`;

export const panelBodyClass = "flex min-h-0 flex-1 flex-col p-3";

export const formGridClass = "flex min-h-0 flex-1 flex-col gap-2.5";

export const formCardClass =
    "flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-[#e8e8ed] bg-white";

export const formCardHeadClass =
    "flex h-[30px] flex-none items-center gap-2 border-b border-[#e8e8ed] bg-[#fbfbfd] pl-1 pr-2";

export const formCardTitleClass = "pl-1 text-[12px] font-semibold tracking-[0.02em] text-[#424245]";

export const formCardBodyClass = `flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1 ${hiddenScrollbar}`;

export const rowClass = "flex h-[30px] items-center gap-1 rounded-md px-1";

export const ruleRowClass =
    "grid h-[30px] grid-cols-[26px_minmax(0,1fr)_26px_minmax(0,1fr)_26px] items-center gap-1 rounded-md px-1";

export const selectedRowClass = "bg-[#0071e3]/6 outline outline-1 outline-[#0071e3]/40";

export const selectHandleSlotClass = `group inline-grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-md hover:bg-[#f5f5f7] ${focusRing}`;

export const selectDotClass =
    "size-3.5 rounded-full border-[1.5px] border-[#d2d2d7] transition-colors group-hover:border-[#86868b]";

export const selectDotActiveClass =
    "size-3.5 rounded-full border-[1.5px] border-[#0071e3] bg-[#0071e3]";

export const rowArrowClass =
    "inline-flex size-[26px] shrink-0 items-center justify-center text-[#86868b]";

export const mutedTextClass = "p-2 text-[12px] text-[#6e6e73]";

export const outputCardClass =
    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e8ed] bg-[#fbfbfd]";

export const outputBodyClass = `min-h-0 flex-1 overflow-y-auto ${hiddenScrollbar}`;

export function focusLast(group: "source" | "transform" | "sink"): void {
    requestAnimationFrame(() => {
        const nodes = document.querySelectorAll<HTMLElement>(`[data-focus-group="${group}"]`);
        nodes[nodes.length - 1]?.focus();
    });
}
