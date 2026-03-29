import { useTranslation } from "react-i18next";
import type { MouseEvent, RefObject } from "react";
import type { CoverContextMenuState, RecordData } from "./types";

interface CoverPanelProps {
  currentRecord: RecordData | null;
  coverImportingSuffix: "cd" | "lp" | null;
  contextMenu: CoverContextMenuState | null;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  getImageSrc: (path: string | null | undefined) => string;
  onOpenContextMenu: (e: MouseEvent<HTMLButtonElement>, suffix: "cd" | "lp") => void;
  onOpenCoverLookup: (suffix: "cd" | "lp") => void;
  onPasteFromClipboard: (suffix: "cd" | "lp") => void;
  onCopyToClipboard: (suffix: "cd" | "lp") => void;
  onCopyCoverPath: (suffix: "cd" | "lp") => void;
  onDeleteCover: (suffix: "cd" | "lp") => void;
}

function CoverPanel({
  currentRecord,
  coverImportingSuffix,
  contextMenu,
  contextMenuRef,
  getImageSrc,
  onOpenContextMenu,
  onOpenCoverLookup,
  onPasteFromClipboard,
  onCopyToClipboard,
  onCopyCoverPath,
  onDeleteCover,
}: Readonly<CoverPanelProps>) {
  const { t } = useTranslation();

  return (
    <>
      <div className="field-group photo-cd-wrapper">
        <label htmlFor="cd-cover-button">{t("fields.cd_cover")}</label>
        <button
          type="button"
          className={`photo-box${coverImportingSuffix === "cd" ? " is-busy" : ""}`}
          id="cd-cover-button"
          onContextMenu={(e) => onOpenContextMenu(e, "cd")}
          disabled={coverImportingSuffix === "cd"}
        >
          {currentRecord?.cd_cover_path && (
            <img
              src={getImageSrc(currentRecord.cd_cover_path)}
              alt={`${currentRecord.title || "Album"} - CD Cover`}
              onError={(e) => (e.currentTarget.style.display = "none")}
              onLoad={(e) => (e.currentTarget.style.display = "block")}
            />
          )}
          {coverImportingSuffix === "cd" && (
            <span className="photo-box-status">{t("cover_lookup.importing")}</span>
          )}
        </button>
      </div>

      <div className="field-group photo-lp-wrapper">
        <label htmlFor="lp-cover-button">{t("fields.lp_cover")}</label>
        <button
          type="button"
          className={`photo-box${coverImportingSuffix === "lp" ? " is-busy" : ""}`}
          id="lp-cover-button"
          onContextMenu={(e) => onOpenContextMenu(e, "lp")}
          disabled={coverImportingSuffix === "lp"}
        >
          {currentRecord?.lp_cover_path && (
            <img
              src={getImageSrc(currentRecord.lp_cover_path)}
              alt={`${currentRecord.title || "Album"} - LP Cover`}
              onError={(e) => (e.currentTarget.style.display = "none")}
              onLoad={(e) => (e.currentTarget.style.display = "block")}
            />
          )}
          {coverImportingSuffix === "lp" && (
            <span className="photo-box-status">{t("cover_lookup.importing")}</span>
          )}
        </button>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <button onClick={() => onOpenCoverLookup(contextMenu.suffix)}>
            <span className="menu-item-icon" aria-hidden="true">🌐</span>
            {t("actions.search_cover_online")}
          </button>
          <button onClick={() => onPasteFromClipboard(contextMenu.suffix)}>
            <span className="menu-item-icon" aria-hidden="true">📥</span>
            {t("actions.paste")}
          </button>
          {(contextMenu.suffix === "cd" ? currentRecord?.cd_cover_path : currentRecord?.lp_cover_path) && (
            <>
              <button onClick={() => onCopyToClipboard(contextMenu.suffix)}>
                <span className="menu-item-icon" aria-hidden="true">🖼️</span>
                {t("actions.copy")}
              </button>
              <button onClick={() => onCopyCoverPath(contextMenu.suffix)}>
                <span className="menu-item-icon" aria-hidden="true">📂</span>
                {t("actions.copy_file_path")}
              </button>
              <button onClick={() => onDeleteCover(contextMenu.suffix)}>
                <span className="menu-item-icon" aria-hidden="true">🗑️</span>
                {t("actions.delete_cover")}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default CoverPanel;
