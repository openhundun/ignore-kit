/** 把文本写入剪贴板；非安全上下文回退到隐藏 textarea + execCommand。失败时抛出具体错误。 */
export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            throw new Error(`Failed to write to clipboard: ${describeError(error)}`);
        }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.className = "sr-only";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        if (!document.execCommand("copy")) {
            throw new Error("execCommand returned false");
        }
    } catch (error) {
        throw new Error(
            `Failed to write to clipboard: ${describeError(error)}. Please copy manually.`,
        );
    } finally {
        textarea.remove();
    }
}

/** 统一把未知错误转成可读文本。 */
export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
