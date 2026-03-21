import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import type { CoverCandidate, CoverSuffix } from "./coverLookup";

interface CoverLookupDialogProps {
  isOpen: boolean;
  suffix: CoverSuffix | null;
  candidates: CoverCandidate[];
  isLoading: boolean;
  errorMessage: string | null;
  onAccept: (candidate: CoverCandidate) => void;
  onClose: () => void;
}

async function openSourceUrl(
  sourceUrl: string,
  buildFailureMessage: (sourceUrl: string, error: string) => string,
) {
  try {
    await openUrl(sourceUrl);
  } catch (error) {
    console.error("Failed to open cover source:", error);
    try {
      await writeText(sourceUrl);
    } catch (clipboardError) {
      console.error("Failed to copy source URL to clipboard:", clipboardError);
    }
    alert(buildFailureMessage(sourceUrl, String(error)));
  }
}

function CoverLookupDialog({
  isOpen,
  suffix,
  candidates,
  isLoading,
  errorMessage,
  onAccept,
  onClose,
}: Readonly<CoverLookupDialogProps>) {
  const { t } = useTranslation();

  if (!isOpen || !suffix) {
    return null;
  }

  return (
    <div className="cover-lookup-backdrop">
      <dialog
        className="cover-lookup-dialog"
        open
        aria-labelledby="cover-lookup-title"
      >
        <div className="cover-lookup-header">
          <div>
            <h3 id="cover-lookup-title">{t("cover_lookup.title", { type: suffix.toUpperCase() })}</h3>
            <p>{t("cover_lookup.subtitle")}</p>
          </div>
          <button
            type="button"
            className="cover-lookup-close"
            onClick={onClose}
            aria-label={t("cover_lookup.discard")}
          >
            ×
          </button>
        </div>

        {isLoading && <p className="cover-lookup-status">{t("cover_lookup.searching")}</p>}
        {!isLoading && errorMessage && <p className="cover-lookup-error">{errorMessage}</p>}
        {!isLoading && !errorMessage && candidates.length === 0 && (
          <p className="cover-lookup-status">{t("cover_lookup.no_results")}</p>
        )}

        {!isLoading && candidates.length > 0 && (
          <div className="cover-lookup-grid">
            {candidates.map((candidate) => (
              <article className="cover-lookup-card" key={`${candidate.release_id}-${candidate.image_url}`}>
                <img
                  className="cover-lookup-image"
                  src={candidate.thumbnail_url}
                  alt={t("cover_lookup.preview_alt", {
                    title: candidate.title,
                    artist: candidate.artist,
                  })}
                />
                <div className="cover-lookup-meta">
                  <strong>{candidate.title}</strong>
                  <span>{candidate.artist}</span>
                  <span>
                    {[candidate.date, candidate.country, candidate.format]
                      .filter((value): value is string => Boolean(value))
                      .join(" • ")}
                  </span>
                </div>
                <div className="cover-lookup-actions">
                  <button
                    type="button"
                    className="cover-lookup-source"
                    onClick={() => openSourceUrl(
                      candidate.source_url,
                      (sourceUrl, error) => t("cover_lookup.open_source_error", {
                        url: sourceUrl,
                        error,
                      }),
                    )}
                  >
                    {t("cover_lookup.open_source")}
                  </button>
                  <button type="button" onClick={() => onAccept(candidate)}>
                    {t("cover_lookup.accept")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="cover-lookup-footer">
          <button type="button" className="confirm-cancel" onClick={onClose}>
            {t("cover_lookup.discard")}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export default CoverLookupDialog;