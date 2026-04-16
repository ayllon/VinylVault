import { useEffect, useRef, useState } from "react";
import Select from "react-select";
import type { Theme, StylesConfig } from "react-select";
import { useTranslation } from "react-i18next";
import type { SelectOption, UpdateInfo } from "./types";

interface NavigationBarProps {
  groups: string[];
  titles: string[];
  searchArtist: string;
  searchAlbum: string;
  selectStyles: StylesConfig<SelectOption, false>;
  selectTheme: (theme: Theme) => Theme;
  recordIndex: number;
  totalRecords: number;
  updateInfo: UpdateInfo | null;
  onSearchArtistChange: (value: string) => void;
  onSearchAlbumChange: (value: string) => void;
  onSearchArtist: (value: string) => void;
  onSearchAlbum: (value: string) => void;
  onFirstRecord: () => void;
  onPreviousRecord: () => void;
  onNextRecord: () => void;
  onLastRecord: () => void;
  onOpenReleasePage: () => Promise<void> | void;
  onAdd: () => Promise<void> | void;
  onDelete: () => void;
  onCreateArchive: () => Promise<void> | void;
  isCreatingArchive: boolean;
  activityText: string;
  showSearchControls?: boolean;
  showBottomBar?: boolean;
}

function NavigationBar({
  groups,
  titles,
  searchArtist,
  searchAlbum,
  selectStyles,
  selectTheme,
  recordIndex,
  totalRecords,
  updateInfo,
  onSearchArtistChange,
  onSearchAlbumChange,
  onSearchArtist,
  onSearchAlbum,
  onFirstRecord,
  onPreviousRecord,
  onNextRecord,
  onLastRecord,
  onOpenReleasePage,
  onAdd,
  onDelete,
  onCreateArchive,
  isCreatingArchive,
  activityText,
  showSearchControls = true,
  showBottomBar = true,
}: Readonly<NavigationBarProps>) {
  const { t } = useTranslation();
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const advancedMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAdvancedOpen) {
      return;
    }

    const onGlobalClick = (event: MouseEvent) => {
      if (!advancedMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !advancedMenuRef.current.contains(target)) {
        setIsAdvancedOpen(false);
      }
    };

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAdvancedOpen(false);
      }
    };

    globalThis.addEventListener("mousedown", onGlobalClick);
    globalThis.addEventListener("keydown", onGlobalKeyDown);
    return () => {
      globalThis.removeEventListener("mousedown", onGlobalClick);
      globalThis.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [isAdvancedOpen]);

  const handleCreateArchiveClick = async () => {
    setIsAdvancedOpen(false);
    await onCreateArchive();
  };

  return (
    <>
      {showSearchControls && (
      <div className="action-bar">
        <div className="search-boxes">
          <div className="search-box" style={{ flex: 2 }}>
            <label>{t("search.by_group")}</label>
            <Select
              options={groups.map((groupOption) => ({ value: groupOption, label: groupOption }))}
              value={
                searchArtist
                  ? { value: searchArtist, label: searchArtist }
                  : null
              }
              onChange={(option) => {
                const newValue = option?.value || "";
                onSearchArtistChange(newValue);
                onSearchAlbumChange("");
                if (newValue) {
                  onSearchArtist(newValue);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchArtist) {
                  onSearchArtist(searchArtist);
                }
              }}
              isSearchable
              isClearable
              placeholder={t("search.group_placeholder")}
              styles={selectStyles}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              menuPlacement="auto"
              menuShouldBlockScroll={true}
              theme={selectTheme}
            />
          </div>

          <div className="search-box" style={{ flex: 2 }}>
            <label>{t("search.by_album")}</label>
            <Select
              options={titles.map((titleOption) => ({ value: titleOption, label: titleOption }))}
              value={
                searchAlbum
                  ? { value: searchAlbum, label: searchAlbum }
                  : null
              }
              onChange={(option) => {
                const newValue = option?.value || "";
                onSearchAlbumChange(newValue);
                onSearchArtistChange("");
                if (newValue) {
                  onSearchAlbum(newValue);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchAlbum) {
                  onSearchAlbum(searchAlbum);
                }
              }}
              isSearchable
              isClearable
              placeholder={t("search.album_placeholder")}
              styles={selectStyles}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              menuPlacement="auto"
              menuShouldBlockScroll={true}
              theme={selectTheme}
            />
          </div>
        </div>
      </div>
      )}

      {showBottomBar && (
      <div className="nav-bar-bottom">
        <span>{t("record.singular")}:</span>
        <button
          onClick={onFirstRecord}
          disabled={recordIndex === 0}
          aria-label={t("record.first")}
          title={t("record.first")}
        >
          ⏮
        </button>
        <button
          onClick={onPreviousRecord}
          disabled={recordIndex === 0}
          aria-label={t("record.previous")}
          title={t("record.previous")}
        >
          ◀
        </button>
        <span className="record-count">
          {recordIndex + 1} {t("record.of")} {totalRecords}
        </span>
        <button
          onClick={onNextRecord}
          disabled={recordIndex >= totalRecords - 1}
          aria-label={t("record.next")}
          title={t("record.next")}
        >
          ▶
        </button>
        <button
          onClick={onLastRecord}
          disabled={recordIndex >= totalRecords - 1}
          aria-label={t("record.last")}
          title={t("record.last")}
        >
          ⏭
        </button>

        <div className="nav-info-box" aria-live="polite" title={activityText}>
          {activityText}
        </div>

        <div className="nav-action-buttons">
          <div className="advanced-menu" ref={advancedMenuRef}>
            <button
              type="button"
              className="advanced-trigger"
              onClick={() => setIsAdvancedOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={isAdvancedOpen}
              aria-label={t("advanced.title")}
            >
              ⚙️
            </button>
            {isAdvancedOpen && (
              <div className="advanced-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCreateArchiveClick}
                  disabled={isCreatingArchive}
                >
                  {isCreatingArchive ? t("advanced.creating_archive") : t("advanced.create_archive")}
                </button>
              </div>
            )}
          </div>
          {updateInfo && (
            <button
              type="button"
              className="update-indicator"
              onClick={onOpenReleasePage}
              title={t("updates.tooltip", { version: updateInfo.latest_version })}
              aria-label={t("updates.aria_label", { version: updateInfo.latest_version })}
            >
              <span className="update-indicator-icon" aria-hidden="true">⬆️</span>
              <span className="update-indicator-text">{t("updates.title")}</span>
            </button>
          )}
          <button onClick={onAdd} className="btn-add">
            ➕ {t("actions.add")}
          </button>
          <button onClick={onDelete} className="btn-delete">
            🗑 {t("actions.delete")}
          </button>
        </div>
      </div>
      )}
    </>
  );
}

export default NavigationBar;
