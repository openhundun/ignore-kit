import type { JSX } from "solid-js";

export type IconName = "arrow" | "copy" | "down" | "download" | "fetch" | "plus" | "x";

const iconPaths: Record<IconName, () => JSX.Element> = {
    plus: () => <path d="M12 5v14M5 12h14" />,
    x: () => <path d="M6 6l12 12M18 6L6 18" />,
    arrow: () => (
        <>
            <path d="M4 12h15" />
            <path d="M13 6l6 6-6 6" />
        </>
    ),
    down: () => <path d="M6 9l6 6 6-6" />,
    fetch: () => (
        <>
            <path d="M12 4v10" />
            <path d="M8 10l4 4 4-4" />
            <path d="M5 18h14" />
        </>
    ),
    copy: () => (
        <>
            <rect x="9" y="9" width="10" height="10" rx="2" />
            <path d="M15 5H7a2 2 0 0 0-2 2v8" />
        </>
    ),
    download: () => (
        <>
            <path d="M12 4v11" />
            <path d="M8 11l4 4 4-4" />
            <path d="M5 20h14" />
        </>
    ),
};

interface IconProps {
    name: IconName;
    size?: number;
    class?: string;
}

export function Icon(props: IconProps) {
    return (
        <svg
            width={props.size ?? 14}
            height={props.size ?? 14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            class={props.class}
        >
            {iconPaths[props.name]()}
        </svg>
    );
}

export function FolderIcon() {
    return (
        <svg
            width="12"
            height="10"
            viewBox="0 0 12 10"
            fill="currentColor"
            aria-hidden="true"
            class="block"
        >
            <path d="M.5 1.5a1 1 0 0 1 1-1h2.382a.5.5 0 0 1 .447.224L4.95 2h4.55a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V1.5z" />
        </svg>
    );
}
