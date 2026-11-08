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
#[ts(type = "{ $schema?: string; [path: string]: Array<Entry> | string | undefined; }")]
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

pub struct Composer;

impl Composer {
    pub fn parse(text: &str) -> Result<crate::Config, String> {
        let config: crate::Config = serde_json::from_str(text).map_err(|error| format!("invalid config: {error}"))?;
        Self::validate(&config).map(|()| config)
    }

    pub fn config(config: &crate::Config, sources: &std::collections::BTreeMap<String, String>) -> Result<Vec<Output>, String> {
        config
            .outputs
            .iter()
            .map(|(path, entries)| Self::compose_output(path, entries, sources).map(|content| Output { path: path.clone(), content }))
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

    fn split_pattern_lines(text: &str) -> Vec<String> {
        text.lines()
            .map(|line| line.trim_end_matches(['\r', ' ', '\t']))
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .map(str::to_string)
            .collect()
    }

    fn apply_overrides(line_list: Vec<String>, override_list: &[crate::OverrideItem], context: &str) -> Result<(Vec<String>, Vec<String>), String> {
        let mut current = line_list;
        let mut appended = Vec::new();
        override_list.iter().enumerate().try_for_each(|(index, rule)| {
            let has_from = !rule.from.is_empty();
            let has_into = !rule.into.is_empty();
            crate::CheckUtil::ensure(has_from || has_into, || format!("{context}: override[{index}] has empty \"from\" and \"into\""))?;
            crate::CheckUtil::ensure(!has_from || current.iter().any(|line| line == &rule.from), || {
                format!("{context}: override[{index}] \"from\" did not match any upstream line: {:?}", rule.from)
            })?;
            if !has_from {
                appended.push(rule.into.clone());
            } else if has_into {
                current.iter_mut().filter(|line| line.as_str() == rule.from).for_each(|line| *line = rule.into.clone());
            } else {
                current.retain(|line| line != &rule.from);
            }
            Ok::<(), String>(())
        })?;
        Ok((current, appended))
    }

    fn compose_output(path: &str, entries: &[crate::Entry], sources: &std::collections::BTreeMap<String, String>) -> Result<String, String> {
        let mut positive_set = std::collections::BTreeSet::new();
        let mut negative_set = std::collections::BTreeSet::new();
        let mut custom_list = Vec::new();
        entries.iter().enumerate().try_for_each(|(index, entry)| {
            let mut line_list = Vec::new();
            entry.upstream.iter().try_for_each(|key| {
                let text = sources.get(key).ok_or_else(|| format!("{path}: upstream not provided: {key}"))?;
                line_list.extend(Self::split_pattern_lines(text));
                Ok::<(), String>(())
            })?;
            let context = format!("{path}: entry[{index}] {}", entry.upstream.join(", "));
            let (line_list, appended_list) = Self::apply_overrides(line_list, &entry.override_list, &context)?;
            custom_list.extend(appended_list);
            line_list.into_iter().for_each(|line| {
                if line.starts_with('!') {
                    negative_set.insert(line);
                } else {
                    positive_set.insert(line);
                }
            });
            Ok::<(), String>(())
        })?;
        let mut seen_set = std::collections::BTreeSet::new();
        custom_list.retain(|line| seen_set.insert(line.clone()));
        crate::CheckUtil::ensure(!(positive_set.is_empty() && negative_set.is_empty() && custom_list.is_empty()), || {
            format!("{path}: output has no patterns")
        })?;
        let mut content = String::new();
        positive_set.iter().chain(negative_set.iter()).for_each(|line| {
            content.push_str(line);
            content.push('\n');
        });
        if !custom_list.is_empty() {
            if !content.is_empty() {
                content.push('\n');
            }
            custom_list.iter().for_each(|line| {
                content.push_str(line);
                content.push('\n');
            });
        }
        Ok(content)
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

    fn compose_json(config_json: &str, sources_json: &str) -> String {
        let result = (|| -> Result<Vec<crate::Output>, String> {
            let config = crate::Composer::parse(config_json)?;
            let source_map: std::collections::BTreeMap<String, String> = serde_json::from_str(sources_json).map_err(|error| format!("invalid sources: {error}"))?;
            crate::Composer::config(&config, &source_map)
        })();
        match result {
            Ok(output_list) => serde_json::json!({ "outputs": output_list }).to_string(),
            Err(error) => serde_json::json!({ "error": error }).to_string(),
        }
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
