import { Show } from "solid-js";
import type { StatusMessage } from "../types";

interface StatusToastProps {
    message: StatusMessage;
}

/** 底部居中 toast；出错时改用红色底，文本为空时不渲染。 */
export function StatusToast(props: StatusToastProps) {
    return (
        <Show when={props.message.text !== ""}>
            <p
                role="status"
                aria-live="polite"
                class={`pointer-events-none fixed bottom-[42px] left-1/2 z-40 -translate-x-1/2 rounded-lg px-3.5 py-[7px] text-[12px] text-white ${
                    props.message.kind === "error" ? "bg-[#b42318]" : "bg-[rgba(29,29,31,0.94)]"
                }`}
            >
                {props.message.text}
            </p>
        </Show>
    );
}
