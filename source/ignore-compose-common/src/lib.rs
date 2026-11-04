#[cfg(feature = "contract")]
pub mod contract;

#[cfg_attr(feature = "contract", derive(schemars::JsonSchema, ts_rs::TS))]
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct OverrideItem {
    pub from: String,
    pub into: String,
}

#[cfg_attr(feature = "contract", derive(schemars::JsonSchema, ts_rs::TS))]
#[cfg_attr(feature = "contract", ts(type = "{ upstream: string; override?: Array<OverrideItem>; }"))]
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub upstream: String,
    #[serde(default, rename = "override")]
    pub override_list: Vec<OverrideItem>,
}

#[cfg_attr(feature = "contract", derive(schemars::JsonSchema, ts_rs::TS))]
#[cfg_attr(feature = "contract", ts(type = "{ $schema?: string; [path: string]: Array<Entry> | string | undefined; }"))]
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct Config {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(flatten)]
    pub outputs: std::collections::BTreeMap<String, Vec<Entry>>,
}
