#[derive(Debug, Clone, schemars::JsonSchema, serde::Deserialize, serde::Serialize, PartialEq, Eq, ts_rs::TS)]
#[serde(deny_unknown_fields)]
pub struct OverrideItem {
    pub from: String,
    pub into: String,
}

#[derive(Debug, Clone, schemars::JsonSchema, serde::Deserialize, serde::Serialize, PartialEq, Eq, ts_rs::TS)]
#[ts(type = "{ upstream: Array<string>; override?: Array<OverrideItem>; }")]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub upstream: Vec<String>,
    #[serde(default, rename = "override")]
    pub override_list: Vec<OverrideItem>,
}

#[derive(Debug, Clone, schemars::JsonSchema, serde::Deserialize, serde::Serialize, ts_rs::TS)]
#[ts(type = "{ [path: string]: Array<Entry>; }")]
pub struct Config {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(flatten)]
    pub outputs: std::collections::BTreeMap<String, Vec<Entry>>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Output {
    pub path: String,
    pub content: String,
}

pub struct CheckUtil;

impl CheckUtil {
    pub fn ensure(condition: bool, message: impl FnOnce() -> String) -> Result<(), String> {
        match condition {
            true => Ok(()),
            false => Err(message()),
        }
    }

    fn reject(failure: Option<String>) -> Result<(), String> {
        failure.map_or(Ok(()), Err)
    }
}

pub struct PatternLine {
    pub text: String,
    pub global: bool,
}

pub struct Composer;

impl Composer {
    pub fn parse(text: &str) -> Result<crate::Config, String> {
        let config: crate::Config = serde_json::from_str(text).map_err(|error| format!("invalid config: {error}"))?;
        Self::validate(&config).map(|()| config)
    }

    pub fn config(config: &crate::Config, sources: &std::collections::BTreeMap<String, String>) -> Result<Vec<Output>, String> {
        Self::config_mode(config, sources, true)
    }

    /// 预览用：缺失 upstream 与未命中的 from 规则跳过，先渲染已加载部分。
    pub fn config_partial(config: &crate::Config, sources: &std::collections::BTreeMap<String, String>) -> Result<Vec<Output>, String> {
        Self::config_mode(config, sources, false)
    }

    fn config_mode(config: &crate::Config, sources: &std::collections::BTreeMap<String, String>, strict: bool) -> Result<Vec<Output>, String> {
        config
            .outputs
            .iter()
            .map(|(path, entries)| Self::compose_output(path, entries, sources, strict).map(|content| Output { path: path.clone(), content }))
            .collect()
    }

    pub fn upstreams(config: &crate::Config) -> Vec<String> {
        let mut url_list: Vec<String> = config.outputs.values().flatten().flat_map(|entry| entry.upstream.iter().cloned()).collect();
        url_list.sort();
        url_list.dedup();
        url_list
    }

    fn validate(config: &crate::Config) -> Result<(), String> {
        crate::CheckUtil::ensure(!config.outputs.is_empty(), || "config has no outputs".to_string())?;
        config.outputs.iter().try_for_each(|(path, entries)| {
            Self::validate_path(path)?;
            crate::CheckUtil::ensure(!entries.is_empty(), || format!("{path}: no upstream entries"))?;
            entries.iter().enumerate().try_for_each(|(index, entry)| Self::validate_entry(path, index, entry))
        })
    }

    fn validate_entry(path: &str, index: usize, entry: &crate::Entry) -> Result<(), String> {
        crate::CheckUtil::ensure(!entry.upstream.iter().any(String::is_empty), || format!("{path}: entry[{index}] has empty upstream key"))?;
        crate::CheckUtil::reject(
            entry
                .override_list
                .iter()
                .enumerate()
                .find(|(_, rule)| entry.upstream.is_empty() && !rule.from.is_empty())
                .map(|(rule_index, _)| format!("{path}: entry[{index}].override[{rule_index}] must use an empty \"from\" inside a custom entry")),
        )?;
        crate::CheckUtil::reject(
            entry
                .override_list
                .iter()
                .enumerate()
                .find(|(_, rule)| rule.from.is_empty() && rule.into.is_empty())
                .map(|(rule_index, _)| format!("{path}: entry[{index}].override[{rule_index}] has empty \"from\" and \"into\"")),
        )
    }

    fn validate_path(path: &str) -> Result<(), String> {
        crate::CheckUtil::ensure(!path.is_empty(), || "output path is empty".to_string())?;
        crate::CheckUtil::ensure(!path.contains('\\'), || format!("{path}: output path must use forward slashes"))?;
        let candidate = std::path::Path::new(path);
        crate::CheckUtil::ensure(!candidate.is_absolute(), || format!("{path}: output path must be relative"))?;
        candidate.components().try_for_each(|component| match component {
            std::path::Component::Normal(_) => Ok(()),
            std::path::Component::CurDir => Err(format!("{path}: output path must not contain \".\"")),
            std::path::Component::ParentDir => Err(format!("{path}: output path must not contain \"..\"")),
            _ => Err(format!("{path}: output path must be relative")),
        })?;
        let name = candidate.file_name().and_then(|value| value.to_str()).unwrap_or_default();
        crate::CheckUtil::ensure(name.to_ascii_lowercase().contains("ignore"), || format!("{path}: output file name must contain \"ignore\""))
    }

    fn split_pattern_lines(text: &str, global: bool) -> Vec<PatternLine> {
        text.lines()
            .map(|line| line.trim_end_matches(['\r', ' ', '\t']))
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .map(|line| PatternLine { text: line.to_string(), global })
            .collect()
    }

    fn is_global_upstream(key: &str) -> bool {
        key.split(|character| character == '/' || character == '\\').any(|segment| segment == "Global")
    }

    fn apply_overrides(line_list: Vec<PatternLine>, override_list: &[crate::OverrideItem], context: &str, strict: bool) -> Result<(Vec<PatternLine>, Vec<String>), String> {
        let mut current = line_list;
        let mut appended = Vec::new();
        override_list.iter().enumerate().try_for_each(|(index, rule)| {
            let has_from = !rule.from.is_empty();
            let has_into = !rule.into.is_empty();
            crate::CheckUtil::ensure(has_from || has_into, || format!("{context}: override[{index}] has empty \"from\" and \"into\""))?;
            if has_from {
                let matched = current.iter().any(|line| line.text == rule.from);
                crate::CheckUtil::ensure(matched || !strict, || format!("{context}: override[{index}] \"from\" did not match any upstream line: {:?}", rule.from))?;
                if matched {
                    if has_into {
                        current.iter_mut().filter(|line| line.text == rule.from).for_each(|line| line.text = rule.into.clone());
                    } else {
                        current.retain(|line| line.text != rule.from);
                    }
                }
            } else {
                appended.push(rule.into.clone());
            }
            Ok::<(), String>(())
        })?;
        Ok((current, appended))
    }

    fn compose_output(path: &str, entries: &[crate::Entry], sources: &std::collections::BTreeMap<String, String>, strict: bool) -> Result<String, String> {
        let mut positive_map = std::collections::BTreeMap::<String, bool>::new();
        let mut negative_map = std::collections::BTreeMap::<String, bool>::new();
        let mut custom_list = Vec::new();
        entries.iter().enumerate().try_for_each(|(index, entry)| {
            let mut line_list = Vec::new();
            entry.upstream.iter().try_for_each(|key| match sources.get(key) {
                Some(text) => {
                    line_list.extend(Self::split_pattern_lines(text, Self::is_global_upstream(key)));
                    Ok(())
                }
                None => crate::CheckUtil::ensure(!strict, || format!("{path}: upstream not provided: {key}")),
            })?;
            let context = format!("{path}: entry[{index}] {}", entry.upstream.join(", "));
            let (line_list, appended_list) = Self::apply_overrides(line_list, &entry.override_list, &context, strict)?;
            custom_list.extend(appended_list);
            line_list.into_iter().for_each(|line| {
                let target = if line.text.starts_with('!') { &mut negative_map } else { &mut positive_map };
                target.entry(line.text).and_modify(|global| *global |= line.global).or_insert(line.global);
            });
            Ok::<(), String>(())
        })?;
        let mut seen_set = std::collections::BTreeSet::new();
        custom_list.retain(|line| seen_set.insert(line.clone()));
        crate::CheckUtil::ensure(!strict || !(positive_map.is_empty() && negative_map.is_empty() && custom_list.is_empty()), || {
            format!("{path}: output has no patterns")
        })?;
        let mut global_positive = Vec::new();
        let mut local_positive = Vec::new();
        positive_map.into_iter().for_each(|(line, global)| {
            if global {
                global_positive.push(line);
            } else {
                local_positive.push(line);
            }
        });
        let negative_list = negative_map.into_keys().collect::<Vec<_>>();
        let mut content = String::new();
        Self::append_lines(&mut content, &global_positive);
        Self::append_lines(&mut content, &local_positive);
        Self::append_lines(&mut content, &negative_list);
        if !custom_list.is_empty() {
            if !content.is_empty() {
                content.push('\n');
            }
            Self::append_lines(&mut content, &custom_list);
        }
        Ok(content)
    }

    fn append_lines(content: &mut String, line_list: &[String]) {
        line_list.iter().for_each(|line| {
            content.push_str(line);
            content.push('\n');
        });
    }
}

#[cfg(target_arch = "wasm32")]
static RESULT_LEN: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(target_arch = "wasm32")]
pub struct Wasm;

#[cfg(target_arch = "wasm32")]
impl Wasm {
    fn plan_json(config_json: &str) -> String {
        let result = (|| -> Result<serde_json::Value, String> {
            let config = crate::Composer::parse(config_json)?;
            Ok(serde_json::json!({ "upstreams": crate::Composer::upstreams(&config), "outputs": config.outputs.keys().cloned().collect::<Vec<_>>() }))
        })();
        match result {
            Ok(value) => value.to_string(),
            Err(error) => serde_json::json!({ "error": error }).to_string(),
        }
    }

    fn compose_json_with(config_json: &str, sources_json: &str, strict: bool) -> String {
        let result = (|| -> Result<Vec<crate::Output>, String> {
            let config = crate::Composer::parse(config_json)?;
            let source_map: std::collections::BTreeMap<String, String> = serde_json::from_str(sources_json).map_err(|error| format!("invalid sources: {error}"))?;
            match strict {
                true => crate::Composer::config(&config, &source_map),
                false => crate::Composer::config_partial(&config, &source_map),
            }
        })();
        match result {
            Ok(output_list) => serde_json::json!({ "outputs": output_list }).to_string(),
            Err(error) => serde_json::json!({ "error": error }).to_string(),
        }
    }

    fn compose_json(config_json: &str, sources_json: &str) -> String {
        Self::compose_json_with(config_json, sources_json, true)
    }

    fn compose_preview_json(config_json: &str, sources_json: &str) -> String {
        Self::compose_json_with(config_json, sources_json, false)
    }

    fn read_input(ptr: *const u8, len: usize) -> &'static str {
        match ptr.is_null() || len == 0 {
            true => "",
            false => unsafe { std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or_default() },
        }
    }

    fn response(value: String) -> *mut u8 {
        let boxed = value.into_bytes().into_boxed_slice();
        let len = boxed.len();
        let ptr = Box::into_raw(boxed) as *mut u8;
        RESULT_LEN.store(len, std::sync::atomic::Ordering::Relaxed);
        ptr
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_alloc(len: usize) -> *mut u8 {
        match len == 0 {
            true => std::ptr::null_mut(),
            false => unsafe { std::alloc::alloc(std::alloc::Layout::from_size_align_unchecked(len, 1)) },
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_dealloc(ptr: *mut u8, len: usize) {
        if !ptr.is_null() && len > 0 {
            unsafe { std::alloc::dealloc(ptr, std::alloc::Layout::from_size_align_unchecked(len, 1)) };
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_plan(config_ptr: *const u8, config_len: usize) -> *mut u8 {
        Self::response(Self::plan_json(Self::read_input(config_ptr, config_len)))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose(config_ptr: *const u8, config_len: usize, sources_ptr: *const u8, sources_len: usize) -> *mut u8 {
        Self::response(Self::compose_json(Self::read_input(config_ptr, config_len), Self::read_input(sources_ptr, sources_len)))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_preview(config_ptr: *const u8, config_len: usize, sources_ptr: *const u8, sources_len: usize) -> *mut u8 {
        Self::response(Self::compose_preview_json(Self::read_input(config_ptr, config_len), Self::read_input(sources_ptr, sources_len)))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_result_len() -> usize {
        RESULT_LEN.load(std::sync::atomic::Ordering::Relaxed)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_free(ptr: *mut u8, len: usize) {
        if !ptr.is_null() && len > 0 {
            unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))) };
        }
    }
}
