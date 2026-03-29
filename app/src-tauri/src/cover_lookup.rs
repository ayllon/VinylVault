use futures::stream::{self, StreamExt};
use reqwest::header::ACCEPT;
use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MUSICBRAINZ_SEARCH_URL: &str = "https://musicbrainz.org/ws/2/release";
const COVER_ART_ARCHIVE_RELEASE_URL: &str = "https://coverartarchive.org/release";
const COVER_ART_ARCHIVE_RELEASE_GROUP_URL: &str = "https://coverartarchive.org/release-group";
const MUSICBRAINZ_ACCEPT: &str = "application/json";
const COVER_ART_ACCEPT: &str = "application/json";
const VINYLVAULT_USER_AGENT: &str =
    "VinylVault/0.1.3 (https://github.com/ayllon/VinylVault; a.alvarezayllon@gmail.com)";
const MAX_SEARCH_RESULTS: usize = 8;
const MAX_CANDIDATES: usize = 5;
const CANDIDATE_LOOKUP_CONCURRENCY: usize = 4;

#[derive(Serialize, Deserialize, Clone)]
pub struct CoverSearchQuery {
    pub artist: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub format: Option<String>,
    pub country: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CoverCandidate {
    pub release_id: String,
    pub release_group_id: Option<String>,
    pub title: String,
    pub artist: String,
    pub date: Option<String>,
    pub country: Option<String>,
    pub format: Option<String>,
    pub score: u32,
    pub thumbnail_url: String,
    pub image_url: String,
    pub source_url: String,
}

#[derive(Deserialize)]
struct ReleaseSearchResponse {
    releases: Vec<MusicBrainzRelease>,
}

#[derive(Deserialize)]
struct MusicBrainzRelease {
    id: String,
    title: String,
    #[serde(deserialize_with = "deserialize_score")]
    score: u32,
    date: Option<String>,
    country: Option<String>,
    #[serde(rename = "artist-credit")]
    artist_credit: Option<Vec<ArtistCredit>>,
    #[serde(rename = "release-group")]
    release_group: Option<ReleaseGroup>,
    media: Option<Vec<ReleaseMedia>>,
}

#[derive(Deserialize)]
struct ArtistCredit {
    name: Option<String>,
    artist: Option<Artist>,
}

#[derive(Deserialize)]
struct Artist {
    name: String,
}

#[derive(Deserialize)]
struct ReleaseGroup {
    id: String,
}

#[derive(Deserialize)]
struct ReleaseMedia {
    format: Option<String>,
}

#[derive(Deserialize)]
struct CoverArtResponse {
    images: Vec<CoverArtImage>,
}

#[derive(Deserialize)]
struct CoverArtImage {
    image: String,
    front: bool,
    approved: bool,
    thumbnails: Option<CoverArtThumbnails>,
}

#[derive(Deserialize)]
struct CoverArtThumbnails {
    #[serde(rename = "250")]
    size_250: Option<String>,
    small: Option<String>,
}

struct CoverArtUrls {
    image_url: String,
    thumbnail_url: String,
}

pub async fn search_cover_candidates(
    query: &CoverSearchQuery,
) -> Result<Vec<CoverCandidate>, String> {
    let title = normalize_title_value(query.title.as_deref());
    let artist = normalize_search_value(query.artist.as_deref());

    if title.is_none() && artist.is_none() {
        return Err("Not enough information to search for a cover".to_string());
    }

    let client = build_http_client()?;
    let lucene_query = build_release_query(title.as_deref(), artist.as_deref());

    let search_response = client
        .get(MUSICBRAINZ_SEARCH_URL)
        .header(ACCEPT, MUSICBRAINZ_ACCEPT)
        .query(&[
            ("fmt", "json"),
            ("limit", "8"),
            ("query", lucene_query.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to search MusicBrainz: {}", e))?
        .error_for_status()
        .map_err(|e| format!("MusicBrainz search returned an error: {}", e))?
        .json::<ReleaseSearchResponse>()
        .await
        .map_err(|e| format!("Failed to parse MusicBrainz search response: {}", e))?;

    let mut releases = search_response.releases;
    releases.sort_by_key(|release| std::cmp::Reverse(rank_release(release, query)));

    let candidate_results = stream::iter(
        releases
            .into_iter()
            .take(MAX_SEARCH_RESULTS)
            .enumerate()
            .map(|(index, release)| {
                let client = client.clone();
                async move {
                    build_candidate(&client, release)
                        .await
                        .map(|candidate| (index, candidate))
                }
            }),
    )
    .buffer_unordered(CANDIDATE_LOOKUP_CONCURRENCY)
    .collect::<Vec<_>>()
    .await;

    let mut ordered_candidates = candidate_results
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    ordered_candidates.sort_by_key(|(index, _)| *index);

    let candidates = ordered_candidates
        .into_iter()
        .filter_map(|(_, candidate)| candidate)
        .take(MAX_CANDIDATES)
        .collect();

    Ok(candidates)
}

pub async fn fetch_cover_image_bytes(image_url: &str) -> Result<Vec<u8>, String> {
    let client = build_http_client()?;
    client
        .get(image_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download cover image: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Cover image download returned an error: {}", e))?
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| format!("Failed to read cover image bytes: {}", e))
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
    .timeout(Duration::from_secs(15))
        .user_agent(VINYLVAULT_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

async fn build_candidate(
    client: &reqwest::Client,
    release: MusicBrainzRelease,
) -> Result<Option<CoverCandidate>, String> {
    let cover_art = fetch_cover_art(
        client,
        &release.id,
        release
            .release_group
            .as_ref()
            .map(|group| group.id.as_str()),
    )
    .await?;
    let Some(cover_art) = cover_art else {
        return Ok(None);
    };

    let artist = release_artist_name(&release);
    let format = release_format(&release);
    let release_group_id = release.release_group.as_ref().map(|group| group.id.clone());

    Ok(Some(CoverCandidate {
        release_id: release.id.clone(),
        release_group_id,
        title: release.title.clone(),
        artist,
        date: release.date.clone(),
        country: release.country.clone(),
        format,
        score: release.score,
        thumbnail_url: cover_art.thumbnail_url,
        image_url: cover_art.image_url,
        source_url: format!("https://musicbrainz.org/release/{}", release.id),
    }))
}

async fn fetch_cover_art(
    client: &reqwest::Client,
    release_id: &str,
    release_group_id: Option<&str>,
) -> Result<Option<CoverArtUrls>, String> {
    if let Some(image) = fetch_cover_art_from_endpoint(
        client,
        &format!("{}/{}/", COVER_ART_ARCHIVE_RELEASE_URL, release_id),
    )
    .await?
    {
        return Ok(Some(image));
    }

    if let Some(release_group_id) = release_group_id {
        if let Some(image) = fetch_cover_art_from_endpoint(
            client,
            &format!(
                "{}/{}/",
                COVER_ART_ARCHIVE_RELEASE_GROUP_URL, release_group_id
            ),
        )
        .await?
        {
            return Ok(Some(image));
        }
    }

    Ok(None)
}

async fn fetch_cover_art_from_endpoint(
    client: &reqwest::Client,
    url: &str,
) -> Result<Option<CoverArtUrls>, String> {
    let response = client
        .get(url)
        .header(ACCEPT, COVER_ART_ACCEPT)
        .send()
        .await
        .map_err(|e| format!("Failed to query Cover Art Archive: {}", e))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    let metadata = response
        .error_for_status()
        .map_err(|e| format!("Cover Art Archive returned an error: {}", e))?
        .json::<CoverArtResponse>()
        .await
        .map_err(|e| format!("Failed to parse Cover Art Archive response: {}", e))?;

    let preferred_image = metadata
        .images
        .iter()
        .find(|image| image.front && image.approved)
        .or_else(|| metadata.images.iter().find(|image| image.front))
        .or_else(|| metadata.images.iter().find(|image| image.approved))
        .or_else(|| metadata.images.first());

    let Some(preferred_image) = preferred_image else {
        return Ok(None);
    };

    let thumbnail_url = preferred_image
        .thumbnails
        .as_ref()
        .and_then(|thumbnails| {
            thumbnails
                .size_250
                .clone()
                .or_else(|| thumbnails.small.clone())
        })
        .unwrap_or_else(|| preferred_image.image.clone());

    Ok(Some(CoverArtUrls {
        image_url: normalize_cover_art_url(&preferred_image.image),
        thumbnail_url: normalize_cover_art_url(&thumbnail_url),
    }))
}

fn normalize_search_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_title_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .map(|value| value.trim_matches(|ch| matches!(ch, '"' | '\'' | ' ')))
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_cover_art_url(url: &str) -> String {
    if let Some(stripped) = url.strip_prefix("http://") {
        format!("https://{}", stripped)
    } else {
        url.to_string()
    }
}

fn deserialize_score<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ScoreValue {
        Number(u32),
        Text(String),
    }

    match ScoreValue::deserialize(deserializer)? {
        ScoreValue::Number(value) => Ok(value),
        ScoreValue::Text(value) => value
            .parse::<u32>()
            .map_err(|error| de::Error::custom(format!("invalid score '{value}': {error}"))),
    }
}

fn build_release_query(title: Option<&str>, artist: Option<&str>) -> String {
    let mut parts = Vec::new();

    if let Some(title) = title {
        parts.push(format!("release:{}", quote_term(title)));
    }

    if let Some(artist) = artist {
        parts.push(format!("artist:{}", quote_term(artist)));
    }

    parts.join(" AND ")
}

fn quote_term(value: &str) -> String {
    format!("\"{}\"", escape_lucene(value))
}

fn escape_lucene(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '+' | '-' | '&' | '|' | '!' | '(' | ')' | '{' | '}' | '[' | ']' | '^' | '"' | '~'
            | '*' | '?' | ':' | '\\' | '/' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn rank_release(release: &MusicBrainzRelease, query: &CoverSearchQuery) -> i32 {
    let mut score = i32::try_from(release.score).unwrap_or_default() * 100;

    if let Some(query_year) = query
        .year
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if release
            .date
            .as_deref()
            .is_some_and(|date| date.starts_with(query_year))
        {
            score += 25;
        }
    }

    if let Some(query_country) = query
        .country
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if release
            .country
            .as_deref()
            .is_some_and(|country| country.eq_ignore_ascii_case(query_country))
        {
            score += 20;
        }
    }

    if let Some(query_format) = query
        .format
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if release_format(release)
            .as_deref()
            .is_some_and(|format| format_matches(query_format, format))
        {
            score += 15;
        }
    }

    score
}

fn release_artist_name(release: &MusicBrainzRelease) -> String {
    release
        .artist_credit
        .as_ref()
        .map(|credits| {
            credits
                .iter()
                .filter_map(|credit| {
                    credit
                        .name
                        .clone()
                        .or_else(|| credit.artist.as_ref().map(|artist| artist.name.clone()))
                })
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Unknown artist".to_string())
}

fn release_format(release: &MusicBrainzRelease) -> Option<String> {
    let formats = release
        .media
        .as_ref()
        .map(|media| {
            media
                .iter()
                .filter_map(|medium| medium.format.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if formats.is_empty() {
        None
    } else {
        Some(formats.join(", "))
    }
}

fn format_matches(query_format: &str, release_format: &str) -> bool {
    let query = query_format.to_ascii_lowercase();
    let release = release_format.to_ascii_lowercase();

    match query.as_str() {
        "lp" => release.contains("vinyl"),
        "cd" => release.contains("cd"),
        _ => release.contains(&query),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_lucene_escapes_special_characters() {
        assert_eq!(escape_lucene("AC/DC: Live"), "AC\\/DC\\: Live");
    }

    #[test]
    fn test_build_release_query_combines_title_and_artist() {
        let query = build_release_query(Some("Remain in Light"), Some("Talking Heads"));
        assert_eq!(
            query,
            "release:\"Remain in Light\" AND artist:\"Talking Heads\""
        );
    }

    #[test]
    fn test_normalize_cover_art_url_upgrades_http_to_https() {
        assert_eq!(
            normalize_cover_art_url("http://coverartarchive.org/release/1/2-250.jpg"),
            "https://coverartarchive.org/release/1/2-250.jpg"
        );
        assert_eq!(
            normalize_cover_art_url("https://coverartarchive.org/release/1/2-250.jpg"),
            "https://coverartarchive.org/release/1/2-250.jpg"
        );
    }

    #[test]
    fn test_format_matches_translates_lp_to_vinyl() {
        assert!(format_matches("LP", "12\" Vinyl"));
        assert!(format_matches("CD", "CD"));
        assert!(!format_matches("LP", "CD"));
    }

    #[test]
    fn test_deserialize_score_accepts_number_and_string() {
        #[derive(Deserialize)]
        struct Wrapper {
            #[serde(deserialize_with = "deserialize_score")]
            score: u32,
        }

        let numeric: Wrapper =
            serde_json::from_str(r#"{"score":100}"#).expect("numeric score should deserialize");
        let text: Wrapper =
            serde_json::from_str(r#"{"score":"95"}"#).expect("string score should deserialize");

        assert_eq!(numeric.score, 100);
        assert_eq!(text.score, 95);
    }

    #[test]
    fn test_normalize_title_value_trims_spaces_and_quotes() {
        assert_eq!(
            normalize_title_value(Some("  \" Remain in Light \"  ")),
            Some("Remain in Light".to_string())
        );
        assert_eq!(
            normalize_title_value(Some(" 'Fear of Music' ")),
            Some("Fear of Music".to_string())
        );
        assert_eq!(normalize_title_value(Some(" \"\" ")), None);
    }

    #[test]
    #[ignore = "requires live network access to MusicBrainz and Cover Art Archive"]
    fn test_search_cover_candidates_hits_remote_services() {
        tauri::async_runtime::block_on(async {
            let candidates = search_cover_candidates(&CoverSearchQuery {
                artist: Some("Talking Heads".to_string()),
                title: Some("Remain in Light".to_string()),
                year: Some("1980".to_string()),
                format: Some("LP".to_string()),
                country: None,
            })
            .await
            .expect("remote cover search should succeed");

            assert!(
                !candidates.is_empty(),
                "expected at least one remote cover candidate"
            );

            let first = &candidates[0];
            assert!(
                first.image_url.starts_with("http"),
                "expected remote image url, got '{}'",
                first.image_url
            );
            assert!(
                first
                    .thumbnail_url
                    .starts_with("https://coverartarchive.org/"),
                "expected canonical thumbnail URL, got '{}'",
                first.thumbnail_url
            );

            let bytes = fetch_cover_image_bytes(&first.image_url)
                .await
                .expect("remote cover download should succeed");
            assert!(
                !bytes.is_empty(),
                "expected downloaded remote cover image to contain bytes"
            );
        });
    }
}
