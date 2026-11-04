#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Output {
    pub path: String,
    pub content: String,
}

pub struct Composer;

impl Composer {
    pub fn parse(text: &str) -> Result<ignore_compose_common::Config, String> {
        let config: ignore_compose_common::Config = serde_json::from_str(text).map_err(|error| format!("invalid config: {error}"))?;
        Self::validate_config(&config)?;
        Ok(config)
    }

    pub fn compose(upstream: &str, override_list: &[ignore_compose_common::OverrideItem]) -> Result<String, String> {
        let entry = ignore_compose_common::Entry { upstream: "upstream".to_string(), override_list: override_list.to_vec() };
        let source_map = std::collections::BTreeMap::from([("upstream".to_string(), upstream.to_string())]);
        Self::compose_output(".gitignore", &[entry], &source_map)
    }

    pub fn config(config: &ignore_compose_common::Config, sources: &std::collections::BTreeMap<String, String>) -> Result<Vec<Output>, String> {
        config
            .outputs
            .iter()
            .map(|(path, entries)| Self::compose_output(path, entries, sources).map(|content| Output { path: path.clone(), content }))
            .collect()
    }

    pub fn upstreams(config: &ignore_compose_common::Config) -> Vec<String> {
        let mut url_list: Vec<String> = config.outputs.values().flatten().map(|entry| entry.upstream.clone()).filter(|upstream| !upstream.is_empty()).collect();
        url_list.sort();
        url_list.dedup();
        url_list
    }

    pub fn is_gitignore(path: &str) -> bool {
        std::path::Path::new(path).file_name().and_then(|name| name.to_str()) == Some(".gitignore")
    }

    fn validate_config(config: &ignore_compose_common::Config) -> Result<(), String> {
        if config.outputs.is_empty() {
            return Err("config has no outputs".to_string());
        }
        config.outputs.iter().try_for_each(|(path, entries)| {
            Self::validate_output_path(path)?;
            if entries.is_empty() {
                return Err(format!("{path}: no upstream entries"));
            }
            entries.iter().enumerate().try_for_each(|(entry_index, entry)| {
                if entry.upstream.is_empty() {
                    entry.override_list.iter().enumerate().try_for_each(|(override_index, rule)| {
                        if !rule.from.is_empty() {
                            return Err(format!("{path}: entry[{entry_index}].override[{override_index}] must use an empty \"from\" inside a custom entry"));
                        }
                        Ok(())
                    })?;
                }
                entry.override_list.iter().enumerate().try_for_each(|(override_index, rule)| {
                    if rule.from.is_empty() && rule.into.is_empty() {
                        return Err(format!("{path}: entry[{entry_index}].override[{override_index}] has empty \"from\" and \"into\""));
                    }
                    Ok(())
                })
            })
        })
    }

    fn validate_output_path(path: &str) -> Result<(), String> {
        if path.is_empty() {
            return Err("output path is empty".to_string());
        }
        if path.contains('\\') {
            return Err(format!("{path}: output path must use forward slashes"));
        }
        let candidate = std::path::Path::new(path);
        if candidate.is_absolute() {
            return Err(format!("{path}: output path must be relative"));
        }
        candidate.components().try_for_each(|component| match component {
            std::path::Component::Normal(_) => Ok(()),
            std::path::Component::CurDir => Err(format!("{path}: output path must not contain \".\"")),
            std::path::Component::ParentDir => Err(format!("{path}: output path must not contain \"..\"")),
            _ => Err(format!("{path}: output path must be relative")),
        })?;
        let name = candidate.file_name().and_then(|value| value.to_str()).unwrap_or_default();
        if !name.to_ascii_lowercase().contains("ignore") {
            return Err(format!("{path}: output file name must contain \"ignore\""));
        }
        Ok(())
    }

    fn split_pattern_lines(text: &str) -> Vec<String> {
        text.lines()
            .map(|line| line.trim_end_matches(['\r', ' ', '\t']))
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .map(str::to_string)
            .collect()
    }

    fn apply_overrides(line_list: Vec<String>, override_list: &[ignore_compose_common::OverrideItem], context: &str) -> Result<(Vec<String>, Vec<String>), String> {
        let mut current = line_list;
        let mut appended = Vec::new();
        override_list.iter().enumerate().try_for_each(|(index, rule)| {
            let has_from = !rule.from.is_empty();
            let has_into = !rule.into.is_empty();
            if !has_from && !has_into {
                return Err(format!("{context}: override[{index}] has empty \"from\" and \"into\""));
            }
            if !has_from {
                appended.push(rule.into.clone());
                return Ok(());
            }
            if !current.iter().any(|line| line == &rule.from) {
                return Err(format!("{context}: override[{index}] \"from\" did not match any upstream line: {:?}", rule.from));
            }
            if has_into {
                current.iter_mut().filter(|line| line.as_str() == rule.from).for_each(|line| *line = rule.into.clone());
            } else {
                current.retain(|line| line != &rule.from);
            }
            Ok(())
        })?;
        Ok((current, appended))
    }

    fn compose_output(path: &str, entries: &[ignore_compose_common::Entry], sources: &std::collections::BTreeMap<String, String>) -> Result<String, String> {
        let mut positive_set = std::collections::BTreeSet::new();
        let mut negative_set = std::collections::BTreeSet::new();
        let mut custom_list = Vec::new();
        entries.iter().enumerate().try_for_each(|(index, entry)| {
            if entry.upstream.is_empty() {
                custom_list.extend(entry.override_list.iter().map(|rule| rule.into.clone()));
                return Ok::<(), String>(());
            }
            let text = sources.get(&entry.upstream).ok_or_else(|| format!("{path}: upstream not provided: {}", entry.upstream))?;
            let context = format!("{path}: entry[{index}] {}", entry.upstream);
            let (line_list, appended_list) = Self::apply_overrides(Self::split_pattern_lines(text), &entry.override_list, &context)?;
            custom_list.extend(appended_list);
            line_list.into_iter().for_each(|line| {
                if line.starts_with('!') {
                    negative_set.insert(line);
                } else {
                    positive_set.insert(line);
                }
            });
            Ok(())
        })?;
        let mut seen_set = std::collections::BTreeSet::new();
        custom_list.retain(|line| seen_set.insert(line.clone()));
        if positive_set.is_empty() && negative_set.is_empty() && custom_list.is_empty() {
            return Err(format!("{path}: output has no patterns"));
        }
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
