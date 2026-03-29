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
}: NavigationBarProps) {
  const { t } = useTranslation();

  return (
    <>
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

      <div className="nav-bar-bottom">
        <span>{t("record.singular")}:</span>
        <button onClick={onFirstRecord} disabled={recordIndex === 0}>
          ⏮
        </button>
        <button
          onClick={onPreviousRecord}
          disabled={recordIndex === 0}
        >
          ◀
        </button>
        <span className="record-count">
          {recordIndex + 1} {t("record.of")} {totalRecords}
        </span>
        <button
          onClick={onNextRecord}
          disabled={recordIndex >= totalRecords - 1}
        >
          ▶
        </button>
        <button
          onClick={onLastRecord}
          disabled={recordIndex >= totalRecords - 1}
        >
          ⏭
        </button>

        <div className="nav-action-buttons">
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
    </>
  );
}

export default NavigationBar;
