import { load } from "./index.js";

const ui = {
    addRule: document.getElementById("add-rule"),
    configJson: document.getElementById("config-json"),
    copyConfig: document.getElementById("copy-config"),
    copyPreview: document.getElementById("copy-preview"),
    generate: document.getElementById("generate"),
    lineCount: document.getElementById("line-count"),
    load: document.getElementById("load-template"),
    preview: document.getElementById("preview"),
    ruleCount: document.getElementById("rule-count"),
    rules: document.getElementById("rules"),
    status: document.getElementById("status"),
    text: document.getElementById("upstream-text"),
    url: document.getElementById("template-url"),
};

let api = null;
let generatedContent = "";
let generatedConfig = "";

function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}

function setStatus(message, kind = "") {
    ui.status.textContent = message;
    ui.status.className = kind ? `status status-${kind}` : "status";
}

function countLines(text) {
    if (text === "") {
        return 0;
    }
    const normalized = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
    return normalized === "" ? 0 : normalized.split("\n").length;
}

function readRules() {
    return Array.from(ui.rules.querySelectorAll(".rule-row"), row => {
        const from = row.querySelector(".rule-from").value;
        const into = row.querySelector(".rule-into").value;
        return {
            from: from.trim() === "" ? "" : from,
            into: into.trim() === "" ? "" : into,
        };
    }).filter(rule => rule.from !== "" || rule.into !== "");
}

function updateRuleCount() {
    ui.ruleCount.textContent = `${readRules().length} 条规则`;
}

function appendRule(from = "", into = "") {
    const row = document.createElement("div");
    row.className = "rule-row";

    const fromField = document.createElement("label");
    fromField.className = "rule-field";
    const fromCaption = document.createElement("span");
    fromCaption.textContent = "from";
    const fromInput = document.createElement("input");
    fromInput.type = "text";
    fromInput.className = "rule-from";
    fromInput.placeholder = "上游中的一行";
    fromInput.value = from;
    fromInput.spellcheck = false;

    const intoField = document.createElement("label");
    intoField.className = "rule-field";
    const intoCaption = document.createElement("span");
    intoCaption.textContent = "into";
    const intoInput = document.createElement("input");
    intoInput.type = "text";
    intoInput.className = "rule-into";
    intoInput.placeholder = "替换为，留空表示删除";
    intoInput.value = into;
    intoInput.spellcheck = false;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", "删除这条覆盖规则");
    remove.addEventListener("click", () => {
        row.remove();
        updateRuleCount();
    });

    fromField.append(fromCaption, fromInput);
    intoField.append(intoCaption, intoInput);
    row.append(fromField, intoField, remove);
    ui.rules.append(row);
    updateRuleCount();
    return fromInput;
}

async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fall through to the legacy selection-based copy.
        }
    }
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.className = "copy-helper";
    helper.setAttribute("readonly", "");
    document.body.append(helper);
    try {
        helper.select();
        const copied = document.execCommand("copy");
        if (!copied) {
            throw new Error("浏览器拒绝了复制操作");
        }
    } finally {
        helper.remove();
    }
}

function flashButton(button, message) {
    if (!button.dataset.label) {
        button.dataset.label = button.textContent;
    }
    button.textContent = message;
    window.setTimeout(() => {
        button.textContent = button.dataset.label;
    }, 1200);
}

async function loadTemplate() {
    const value = ui.url.value.trim();
    if (value === "") {
        setStatus("请先输入模板 URL，或直接粘贴模板内容。", "error");
        ui.url.focus();
        return;
    }

    let target;
    try {
        target = new URL(value);
    } catch {
        setStatus("模板 URL 无效，请检查地址格式。", "error");
        ui.url.focus();
        return;
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
        setStatus("模板 URL 只支持 http 或 https。", "error");
        return;
    }

    ui.load.disabled = true;
    setStatus("正在加载模板…");
    try {
        const response = await fetch(target.href, { credentials: "omit", mode: "cors" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        ui.text.value = text;
        setStatus(`已加载 ${countLines(text)} 行模板。`, "ok");
    } catch (error) {
        setStatus(`模板加载失败：${describeError(error)}。可把内容粘贴到下方文本框中继续。`, "error");
        ui.text.focus();
    } finally {
        ui.load.disabled = false;
    }
}

async function generatePreview() {
    if (!api) {
        setStatus("WebAssembly 模块不可用，无法生成预览。", "error");
        return;
    }

    const sourceKey = ui.url.value.trim() || "pasted";
    const overrideList = readRules();
    const config = { ".gitignore": [{ override: overrideList, upstream: sourceKey }] };
    const sources = { [sourceKey]: ui.text.value };

    ui.generate.disabled = true;
    setStatus("正在生成预览…");
    try {
        const outputs = await api.compose(config, sources);
        const output = outputs && outputs[0];
        if (!output) {
            throw new Error("wasm 没有返回输出");
        }

        generatedContent = output.content;
        generatedConfig = JSON.stringify(config, null, 2);

        ui.preview.textContent = generatedContent;
        ui.lineCount.textContent = `${countLines(generatedContent)} 行`;
        ui.ruleCount.textContent = `${overrideList.length} 条规则`;
        ui.configJson.textContent = generatedConfig;
        ui.copyPreview.disabled = false;
        ui.copyConfig.disabled = false;
        setStatus(`已生成 ${output.path}，共 ${countLines(generatedContent)} 行。`, "ok");
    } catch (error) {
        setStatus(`生成失败：${describeError(error)}`, "error");
    } finally {
        ui.generate.disabled = false;
    }
}

ui.load.addEventListener("click", loadTemplate);
ui.url.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        loadTemplate();
    }
});

ui.addRule.addEventListener("click", () => {
    appendRule().focus();
});
ui.rules.addEventListener("input", updateRuleCount);

ui.generate.addEventListener("click", generatePreview);

ui.copyPreview.addEventListener("click", async () => {
    try {
        await copyText(generatedContent);
        flashButton(ui.copyPreview, "已复制");
        setStatus("结果已复制到剪贴板。", "ok");
    } catch (error) {
        setStatus(`复制失败：${describeError(error)}`, "error");
    }
});

ui.copyConfig.addEventListener("click", async () => {
    try {
        await copyText(generatedConfig);
        flashButton(ui.copyConfig, "已复制");
        setStatus("配置已复制到剪贴板。", "ok");
    } catch (error) {
        setStatus(`复制失败：${describeError(error)}`, "error");
    }
});

appendRule();

try {
    api = await load();
    ui.generate.disabled = false;
    setStatus("WebAssembly 模块已就绪。");
} catch (error) {
    setStatus(`WebAssembly 模块加载失败：${describeError(error)}。请通过 HTTP 服务打开本页。`, "error");
}
