use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use semver::Version;

const GITHUB_RELEASES_LATEST_API_URL: &str = "https://api.github.com/repos/ayllon/VinylVault/releases/latest";
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";
const GITHUB_USER_AGENT: &str = "VinylVault-UpdateCheck";

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    name: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    current_version: String,
    latest_version: String,
    release_url: String,
    release_name: Option<String>,
}

struct InternalUpdateInfo {
    current_version: Version,
    latest_version: Version,
    release_url: String,
    release_name: Option<String>,
}

impl From<InternalUpdateInfo> for UpdateInfo {
    fn from(value: InternalUpdateInfo) -> Self {
        Self {
            current_version: value.current_version.to_string(),
            latest_version: value.latest_version.to_string(),
            release_url: value.release_url,
            release_name: value.release_name,
        }
    }
}

fn normalize_release_version(tag: &str) -> &str {
    tag.trim()
        .strip_prefix('v')
        .or_else(|| tag.trim().strip_prefix('V'))
        .unwrap_or(tag.trim())
}

fn build_update_info(
    current_version: &Version,
    release: GitHubRelease,
) -> Result<Option<InternalUpdateInfo>, String> {
    let latest_version = normalize_release_version(&release.tag_name);
    let latest = Version::parse(latest_version)
        .map_err(|e| format!("Invalid GitHub release version '{}': {}", release.tag_name, e))?;

    if latest > *current_version {
        Ok(Some(InternalUpdateInfo {
            current_version: current_version.clone(),
            latest_version: latest,
            release_url: release.html_url,
            release_name: release.name,
        }))
    } else {
        Ok(None)
    }
}

pub async fn fetch_update_info(current_version: &Version) -> Result<Option<UpdateInfo>, String> {
    let release = reqwest::Client::new()
        .get(GITHUB_RELEASES_LATEST_API_URL)
        .header(ACCEPT, GITHUB_API_ACCEPT)
        .header(USER_AGENT, GITHUB_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to contact GitHub releases API: {}", e))?
        .error_for_status()
        .map_err(|e| format!("GitHub releases API returned an error: {}", e))?
        .json::<GitHubRelease>()
        .await
        .map_err(|e| format!("Failed to parse GitHub release response: {}", e))?;

    build_update_info(current_version, release).map(|info| info.map(UpdateInfo::from))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_release_version_strips_v_prefix() {
        assert_eq!(normalize_release_version("v0.1.4"), "0.1.4");
        assert_eq!(normalize_release_version("V2.0.0"), "2.0.0");
        assert_eq!(normalize_release_version("1.3.0"), "1.3.0");
    }

    #[test]
    fn test_build_update_info_returns_update_when_latest_is_newer() {
        let release = GitHubRelease {
            tag_name: "v0.1.4".to_string(),
            html_url: "https://github.com/ayllon/VinylVault/releases/tag/v0.1.4".to_string(),
            name: Some("0.1.4".to_string()),
        };
        let current = Version::parse("0.1.3").expect("current version should parse");

        let info = build_update_info(&current, release)
            .expect("build update info should succeed")
            .expect("an update should be available");

        assert_eq!(info.current_version, Version::parse("0.1.3").expect("version should parse"));
        assert_eq!(info.latest_version, Version::parse("0.1.4").expect("version should parse"));
    }

    #[test]
    fn test_build_update_info_returns_none_when_current_matches_latest() {
        let release = GitHubRelease {
            tag_name: "v0.1.3".to_string(),
            html_url: "https://github.com/ayllon/VinylVault/releases/tag/v0.1.3".to_string(),
            name: None,
        };
        let current = Version::parse("0.1.3").expect("current version should parse");

        let info = build_update_info(&current, release)
            .expect("build update info should succeed");

        assert!(info.is_none());
    }
}