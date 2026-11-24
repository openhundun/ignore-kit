import { appActionsClass, appBarClass, brandClass, buttonClass } from "../ui";

interface AppBarProps {
    onImport: (event: Event) => void;
    onDownload: () => void;
    onCopy: () => void;
}

export function AppBar(props: AppBarProps) {
    return (
        <header class={appBarClass}>
            <h1 class={brandClass}>ignore-compose</h1>
            <div class={appActionsClass}>
                <input
                    id="import-config"
                    type="file"
                    accept="application/json,.json"
                    class="sr-only"
                    onChange={props.onImport}
                />
                <label for="import-config" class={`${buttonClass} cursor-pointer`}>
                    Import JSON
                </label>
                <button type="button" class={buttonClass} onClick={props.onDownload}>
                    Download JSON
                </button>
                <button type="button" class={buttonClass} onClick={props.onCopy}>
                    Copy JSON
                </button>
            </div>
        </header>
    );
}
