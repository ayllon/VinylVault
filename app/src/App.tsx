import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import Select from "react-select";
import type { CSSObjectWithLabel, Theme, StylesConfig } from "react-select";
import CoverLookupDialog from "./CoverLookupDialog";
import { buildGoogleCoverSearchUrl, getImageSrc } from "./appUtils";
import {
  importCoverFromUrl,
  searchCoverCandidates,
  type CoverCandidate,
  type CoverSuffix,
} from "./coverLookup";
import "./App.css";

type SelectOption = { value: string; label: string };

const SELECT_STYLES: StylesConfig<SelectOption, false> = {
  control: (base: CSSObjectWithLabel) => ({
    ...base,
    border: "1px solid #cbd5e0",
    boxShadow: "none",
    ":hover": {
      border: "1px solid #cbd5e0",
    },
  }),
  menu: (base: CSSObjectWithLabel) => ({
    ...base,
    zIndex: 10000,
  }),
  menuPortal: (base: CSSObjectWithLabel) => ({
    ...base,
    zIndex: 10000,
  }),
};

const SELECT_THEME = (theme: Theme): Theme => ({
  ...theme,
  borderRadius: 4,
  colors: {
    ...theme.colors,
    primary: "#3182ce",
    primary25: "#ebf8ff",
  },
});

const CONTEXT_MENU_VIEWPORT_MARGIN = 8;

interface RecordData {
  id: number;
  artist: string | null;
  title: string | null;
  format: string | null;
  year: string | null;
  style: string | null;
  country: string | null;
  tracks: string | null;
  credits: string | null;
  edition: string | null;
  notes: string | null;
  cd_cover_path: string | null;
  lp_cover_path: string | null;
}

interface ImportProgressPayload {
  processed: number;
  total: number;
  percent: number;
}

interface GroupsAndTitlesData {
  groups: string[];
  titles: string[];
  formatos: string[];
}

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  release_url: string;
  release_name: string | null;
}

interface CoverLookupState {
  isOpen: boolean;
  suffix: CoverSuffix | null;
  isLoading: boolean;
  errorMessage: string | null;
  candidates: CoverCandidate[];
}

function App() {
  const { t } = useTranslation();
  const [isDbEmpty, setIsDbEmpty] = useState<boolean | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProcessed, setImportProcessed] = useState<number>(0);
  const [importTotal, setImportTotal] = useState<number>(0);
  const [importPercent, setImportPercent] = useState<number>(0);
  const [recordIndex, setRecordIndex] = useState<number>(0);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [currentRecord, setCurrentRecord] = useState<RecordData | null>(null);

  const [groups, setGroups] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; suffix: "cd" | "lp" } | null>(null);

  const loadSeqRef = useRef(0);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const [searchArtist, setSearchArtist] = useState<string>("");
  const [searchAlbum, setSearchAlbum] = useState<string>("");
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [coverImportingSuffix, setCoverImportingSuffix] = useState<CoverSuffix | null>(null);
  const [coverLookup, setCoverLookup] = useState<CoverLookupState>({
    isOpen: false,
    suffix: null,
    isLoading: false,
    errorMessage: null,
    candidates: [],
  });

  // Check if DB is empty on mount
  useEffect(() => {
    async function checkDb() {
      try {
        const empty = await invoke<boolean>("is_db_empty");
        setIsDbEmpty(empty);
      } catch (e) {
        console.error("Failed to check DB:", e);
      }
    }
    checkDb();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
      try {
        const update = await invoke<UpdateInfo | null>("check_for_updates");
        if (!cancelled) {
          setUpdateInfo(update);
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    }

    checkForUpdates();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadTotalRecords = useCallback(async () => {
    try {
      const total = await invoke<number>("get_total_records");
      setTotalRecords(total);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadComboboxes = useCallback(async () => {
    try {
      const data = await invoke<GroupsAndTitlesData>(
        "get_groups_and_titles",
      );
      setGroups(data.groups);
      setTitles(data.titles);
      setFormats(data.formatos);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (isDbEmpty === false) {
      loadTotalRecords();
      loadComboboxes();
    }
  }, [isDbEmpty, loadTotalRecords, loadComboboxes]);

  useEffect(() => {
    if (isDbEmpty === false && totalRecords > 0) {
      loadRecord(recordIndex);
    }
  }, [recordIndex, totalRecords, isDbEmpty]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<ImportProgressPayload>(
        "mdb-import-progress",
        (event) => {
          const payload = event.payload;
          setImportProcessed(payload.processed ?? 0);
          setImportTotal(payload.total ?? 0);
          setImportPercent(payload.percent ?? 0);
        },
      );
    };

    setupListener().catch((e) => {
      console.error("Failed to register import progress listener", e);
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    if (deleteTargetId === null) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteTargetId(null);
      }
    };

    globalThis.addEventListener("keydown", handleEscape);
    return () => {
      globalThis.removeEventListener("keydown", handleEscape);
    };
  }, [deleteTargetId]);

  useLayoutEffect(() => {
    if (!contextMenu) return;

    const clampContextMenuToViewport = () => {
      const menuElement = contextMenuRef.current;
      if (!(menuElement instanceof HTMLElement)) {
        return;
      }

      const rect = menuElement.getBoundingClientRect();
      const maxX = Math.max(
        CONTEXT_MENU_VIEWPORT_MARGIN,
        window.innerWidth - rect.width - CONTEXT_MENU_VIEWPORT_MARGIN,
      );
      const maxY = Math.max(
        CONTEXT_MENU_VIEWPORT_MARGIN,
        window.innerHeight - rect.height - CONTEXT_MENU_VIEWPORT_MARGIN,
      );

      const nextX = Math.min(Math.max(contextMenu.x, CONTEXT_MENU_VIEWPORT_MARGIN), maxX);
      const nextY = Math.min(Math.max(contextMenu.y, CONTEXT_MENU_VIEWPORT_MARGIN), maxY);

      if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
        setContextMenu((prev) =>
          prev
            ? {
              ...prev,
              x: nextX,
              y: nextY,
            }
            : prev,
        );
      }
    };

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (contextMenuRef.current && target && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    const handleResize = () => {
      clampContextMenuToViewport();
    };

    globalThis.addEventListener("mousedown", handleOutsideClick);
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("resize", handleResize);

    clampContextMenuToViewport();
    const menuElement = contextMenuRef.current;
    if (menuElement instanceof HTMLElement) {
      menuElement.focus();
    }

    return () => {
      globalThis.removeEventListener("mousedown", handleOutsideClick);
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("resize", handleResize);
    };
  }, [contextMenu]);

  async function handleImport() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Microsoft Access", extensions: ["mdb", "accdb"] }],
      });
      if (typeof selected === "string") {
        setImportProcessed(0);
        setImportTotal(0);
        setImportPercent(0);
        setIsImporting(true);
        try {
          const count = await invoke<number>("import_mdb", { mdbPath: selected });
          alert(t("import_success", { count }));
          setIsDbEmpty(false);
          setRecordIndex(0);
        } catch (e) {
          console.error(e);
          alert(t("import_error", { error: e }));
        } finally {
          setIsImporting(false);
        }
      }
    } catch (e) {
      console.error(e);
      alert(t("file_dialog_error"));
    }
  }

  async function loadRecord(offset: number) {
    const seq = ++loadSeqRef.current;
    try {
      const rec = await invoke<RecordData>("get_record", { offset });
      if (seq === loadSeqRef.current) {
        setCurrentRecord(rec);
      }
    } catch (e) {
      if (seq === loadSeqRef.current) {
        console.error(e);
        setCurrentRecord(null);
      }
    }
  }

  async function handleSearchClick(column?: string, value?: string) {
    try {
      let col = column;
      let val = value;
      if (!col && !val) {
        if (searchArtist) {
          col = "artist";
          val = searchArtist;
        } else if (searchAlbum) {
          col = "title";
          val = searchAlbum;
        } else {
          return;
        }
      }

      const offset = await invoke<number>("find_record_offset", {
        column: col,
        value: val,
      });
      setRecordIndex(offset);
    } catch {
      alert(t("errors.record_not_found"));
    }
  }

  function handleCoverContextMenu(
    e: React.MouseEvent<HTMLButtonElement>,
    suffix: "cd" | "lp"
  ) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, suffix });
  }

  async function pasteFromClipboard(suffix: "cd" | "lp") {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    try {
      const newPath = await invoke<string>("save_cover_paste_from_clipboard", {
        recordId: currentRecord.id,
        suffix,
      });

      if (suffix === "cd") {
        setCurrentRecord({ ...currentRecord, cd_cover_path: newPath });
      } else {
        setCurrentRecord({ ...currentRecord, lp_cover_path: newPath });
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      alert(t("cover_paste_error", { type: suffix }));
    }
    setContextMenu(null);
  }

  async function copyToClipboard(suffix: "cd" | "lp") {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const coverPath = suffix === "cd" ? currentRecord.cd_cover_path : currentRecord.lp_cover_path;
    if (!coverPath) {
      setContextMenu(null);
      return;
    }

    try {
      await invoke("copy_cover_to_clipboard", { coverPath });
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
      alert(t("cover_copy_error", { type: suffix, error: String(error) }));
    }
  }

  async function copyCoverFilePath(suffix: "cd" | "lp") {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const coverPath = suffix === "cd" ? currentRecord.cd_cover_path : currentRecord.lp_cover_path;
    if (!coverPath) {
      setContextMenu(null);
      return;
    }

    try {
      await writeText(coverPath);
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to copy cover file path:", error);
      alert(t("cover_path_copy_error", { error: String(error) }));
    }
  }

  async function deleteCover(suffix: "cd" | "lp") {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    try {
      await invoke("delete_cover_for_record", {
        recordId: currentRecord.id,
        suffix,
      });

      if (suffix === "cd") {
        setCurrentRecord({ ...currentRecord, cd_cover_path: null });
      } else {
        setCurrentRecord({ ...currentRecord, lp_cover_path: null });
      }
    } catch (error) {
      console.error("Failed to delete cover:", error);
      alert(t("cover_delete_error", { type: suffix, error: String(error) }));
    }

    setContextMenu(null);
  }

  async function openCoverLookup(suffix: CoverSuffix) {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    setContextMenu(null);
    setCoverLookup({
      isOpen: true,
      suffix,
      isLoading: true,
      errorMessage: null,
      candidates: [],
    });

    try {
      const candidates = await searchCoverCandidates({
        artist: currentRecord.artist,
        title: currentRecord.title,
        year: currentRecord.year,
        format: currentRecord.format,
        country: currentRecord.country,
      });

      setCoverLookup({
        isOpen: true,
        suffix,
        isLoading: false,
        errorMessage: null,
        candidates,
      });
    } catch (error) {
      console.error("Failed to search for cover candidates:", error);
      setCoverLookup({
        isOpen: true,
        suffix,
        isLoading: false,
        errorMessage: t("cover_lookup.search_error", { error: String(error) }),
        candidates: [],
      });
    }
  }

  function closeCoverLookup() {
    setCoverLookup({
      isOpen: false,
      suffix: null,
      isLoading: false,
      errorMessage: null,
      candidates: [],
    });
  }

  async function acceptCoverCandidate(candidate: CoverCandidate) {
    if (!currentRecord || !coverLookup.suffix) {
      return;
    }

    const selectedSuffix = coverLookup.suffix;
    closeCoverLookup();
    setCoverImportingSuffix(selectedSuffix);

    try {
      const newPath = await importCoverFromUrl(
        currentRecord.id,
        selectedSuffix,
        candidate.image_url,
      );

      if (selectedSuffix === "cd") {
        setCurrentRecord({ ...currentRecord, cd_cover_path: newPath });
      } else {
        setCurrentRecord({ ...currentRecord, lp_cover_path: newPath });
      }
    } catch (error) {
      console.error("Failed to import selected cover:", error);
      alert(t("cover_lookup.import_error", { error: String(error) }));
    } finally {
      setCoverImportingSuffix(null);
    }
  }

  // Silent autosaver function
  async function handleSave() {
    if (!currentRecord) return;
    try {
      await invoke("update_record", { record: currentRecord });
      await loadComboboxes();
    } catch (e) {
      console.error("Auto-save failed:", e);
    }
  }

  async function handleAdd() {
    try {
      const newIndex = await invoke<number>("add_record");
      await loadTotalRecords();
      setRecordIndex(newIndex);
    } catch (e) {
      console.error(e);
      alert(t("add_error", { error: e }));
    }
  }

  function handleDelete() {
    if (!currentRecord) return;
    setDeleteTargetId(currentRecord.id);
  }

  async function confirmDelete() {
    if (deleteTargetId === null) return;

    try {
      await invoke("delete_record", { id: deleteTargetId });
      await loadTotalRecords();
      setRecordIndex(0);
      await loadComboboxes();
      setDeleteTargetId(null);
    } catch (e) {
      console.error(e);
      alert(t("delete_error", { error: e }));
    }
  }

  async function handleOpenReleasePage() {
    if (!updateInfo) return;

    try {
      await openUrl(updateInfo.release_url);
    } catch (error) {
      console.error("Failed to open release page:", error);
    }
  }



  if (isDbEmpty === null) {
    return (
      <div className="auth-overlay">
        <h2>{t("app_title")}</h2>
        <p>{t("loading")}</p>
      </div>
    );
  }

  if (isDbEmpty) {
    return (
      <div className="auth-overlay">
        <h2>{t("app_title")}</h2>
        {isImporting ? (
          <div className="import-progress">
            <div className="spinner"></div>
            <p>{t("importing")}</p>
            <progress
              className="progress-track"
              max={100}
              value={Math.max(0, Math.min(100, importPercent))}
            ></progress>
            <p className="import-count">
              {importTotal > 0
                ? t("import_count", { processed: importProcessed, total: importTotal })
                : t("preparing_import")}
            </p>
            <p className="import-note">{t("import_wait")}</p>
          </div>
        ) : (
          <>
            <p>{t("empty_db")}</p>
            <button onClick={handleImport}>
              {t("import_mdb_button")}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="form-container">
      <div className="form-body">
        <div className="field-group artist">
          <label>{t("fields.group")}:</label>
          <input
            type="text"
            value={currentRecord?.artist || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, artist: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group country">
          <label>{t("fields.country")}:</label>
          <input
            type="text"
            value={currentRecord?.country || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, country: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>

        <div className="field-group album">
          <label>{t("fields.album")}:</label>
          <input
            type="text"
            value={currentRecord?.title || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, title: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group year">
          <label>{t("fields.year")}:</label>
          <input
            type="text"
            value={currentRecord?.year || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, year: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group style">
          <label>{t("fields.style")}:</label>
          <input
            type="text"
            value={currentRecord?.style || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, style: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group format">
          <label>{t("fields.format")}:</label>
          <Select
            options={formats.map((f) => ({ value: f, label: f }))}
            value={
              currentRecord?.format
                ? { value: currentRecord.format, label: currentRecord.format }
                : null
            }
            onChange={(option) => {
              if (currentRecord) {
                const updated = {
                  ...currentRecord,
                  format: option?.value || "",
                };
                setCurrentRecord(updated);
                invoke("update_record", { record: updated })
                  .then(() => loadComboboxes())
                  .catch((e) => console.error("Auto-save failed:", e));
              }
            }}
            isSearchable
            placeholder={t("search.format_placeholder")}
            styles={SELECT_STYLES}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            menuPlacement="auto"
            menuShouldBlockScroll={true}
            theme={SELECT_THEME}
          />
        </div>

        <div className="field-group edition">
          <label>{t("fields.edition")}:</label>
          <input
            type="text"
            value={currentRecord?.edition || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, edition: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>

        <div className="field-group notes">
          <label>{t("fields.observations")}:</label>
          <input
            type="text"
            value={currentRecord?.notes || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, notes: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>

        <div className="field-group tracks">
          <label>{t("fields.songs")}</label>
          <textarea
            value={currentRecord?.tracks || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({
                  ...currentRecord,
                  tracks: e.target.value,
                })
                : null
            }
            onBlur={handleSave}
          ></textarea>
        </div>

        <div className="field-group credits">
          <label>{t("fields.credits")}</label>
          <textarea
            value={currentRecord?.credits || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({
                  ...currentRecord,
                  credits: e.target.value,
                })
                : null
            }
            onBlur={handleSave}
          ></textarea>
        </div>

        <div className="field-group photo-cd-wrapper">
          <label htmlFor="cd-cover-button">{t("fields.cd_cover")}</label>
          <button
            type="button"
            className={`photo-box${coverImportingSuffix === "cd" ? " is-busy" : ""}`}
            id="cd-cover-button"
            onContextMenu={(e) => handleCoverContextMenu(e, "cd")}
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
            onContextMenu={(e) => handleCoverContextMenu(e, "lp")}
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

        <div className="action-bar">
          <div className="search-boxes">
            <div className="search-box" style={{ flex: 2 }}>
              <label>{t("search.by_group")}</label>
              <Select
                options={groups.map((g) => ({ value: g, label: g }))}
                value={
                  searchArtist
                    ? { value: searchArtist, label: searchArtist }
                    : null
                }
                onChange={(option) => {
                  const newValue = option?.value || "";
                  setSearchArtist(newValue);
                  setSearchAlbum("");
                  if (newValue) {
                    // Search immediately with the selected value
                    handleSearchClick("artist", newValue);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchArtist) {
                    handleSearchClick("artist", searchArtist);
                  }
                }}
                isSearchable
                isClearable
                placeholder={t("search.group_placeholder")}
                styles={SELECT_STYLES}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                menuShouldBlockScroll={true}
                theme={SELECT_THEME}
              />
            </div>

            <div className="search-box" style={{ flex: 2 }}>
              <label>{t("search.by_album")}</label>
              <Select
                options={titles.map((t) => ({ value: t, label: t }))}
                value={
                  searchAlbum
                    ? { value: searchAlbum, label: searchAlbum }
                    : null
                }
                onChange={(option) => {
                  const newValue = option?.value || "";
                  setSearchAlbum(newValue);
                  setSearchArtist("");
                  if (newValue) {
                    // Search immediately with the selected value
                    handleSearchClick("title", newValue);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchAlbum) {
                    handleSearchClick("title", searchAlbum);
                  }
                }}
                isSearchable
                isClearable
                placeholder={t("search.album_placeholder")}
                styles={SELECT_STYLES}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                menuShouldBlockScroll={true}
                theme={SELECT_THEME}
              />
            </div>


          </div>
        </div>
      </div>

      <div className="nav-bar-bottom">
        <span>{t("record.singular")}:</span>
        <button onClick={() => setRecordIndex(0)} disabled={recordIndex === 0}>
          ⏮
        </button>
        <button
          onClick={() => setRecordIndex(recordIndex - 1)}
          disabled={recordIndex === 0}
        >
          ◀
        </button>
        <span className="record-count">
          {recordIndex + 1} {t("record.of")} {totalRecords}
        </span>
        <button
          onClick={() => setRecordIndex(recordIndex + 1)}
          disabled={recordIndex >= totalRecords - 1}
        >
          ▶
        </button>
        <button
          onClick={() => setRecordIndex(totalRecords - 1)}
          disabled={recordIndex >= totalRecords - 1}
        >
          ⏭
        </button>

        <div className="nav-action-buttons">
          {updateInfo && (
            <button
              type="button"
              className="update-indicator"
              onClick={handleOpenReleasePage}
              title={t("updates.tooltip", { version: updateInfo.latest_version })}
              aria-label={t("updates.aria_label", { version: updateInfo.latest_version })}
            >
              <span className="update-indicator-icon" aria-hidden="true">⬆️</span>
              <span className="update-indicator-text">{t("updates.title")}</span>
            </button>
          )}
          <button onClick={handleAdd} className="btn-add">
            ➕ {t("actions.add")}
          </button>
          <button onClick={handleDelete} className="btn-delete"
          >
            🗑 {t("actions.delete")}
          </button>
        </div>
      </div>

      {deleteTargetId !== null && (
        <div
          className="confirm-dialog-backdrop"
        >
          <dialog
            className="confirm-dialog"
            open
            aria-labelledby="delete-dialog-title"
          >
            <h3 id="delete-dialog-title">{t("actions.confirm_delete")}</h3>
            <p>{t("actions.delete_sure")}</p>
            <div className="confirm-dialog-actions">
              <button
                className="confirm-cancel"
                onClick={() => setDeleteTargetId(null)}
              >
                {t("actions.cancel")}
              </button>
              <button className="confirm-delete" onClick={confirmDelete}>
                {t("actions.delete")}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <button onClick={() => openCoverLookup(contextMenu.suffix)}>
            <span className="menu-item-icon" aria-hidden="true">🌐</span>
            {t("actions.search_cover_online")}
          </button>
          <button onClick={() => pasteFromClipboard(contextMenu.suffix)}>
            <span className="menu-item-icon" aria-hidden="true">📥</span>
            {t("actions.paste")}
          </button>
          {(contextMenu.suffix === "cd" ? currentRecord?.cd_cover_path : currentRecord?.lp_cover_path) && (
            <>
              <button onClick={() => copyToClipboard(contextMenu.suffix)}>
                <span className="menu-item-icon" aria-hidden="true">🖼️</span>
                {t("actions.copy")}
              </button>
              <button onClick={() => copyCoverFilePath(contextMenu.suffix)}>
                <span className="menu-item-icon" aria-hidden="true">📂</span>
                {t("actions.copy_file_path")}
              </button>
              <button onClick={() => deleteCover(contextMenu.suffix)}>
                <span className="menu-item-icon" aria-hidden="true">🗑️</span>
                {t("actions.delete_cover")}
              </button>
            </>
          )}
        </div>
      )}

      <CoverLookupDialog
        isOpen={coverLookup.isOpen}
        suffix={coverLookup.suffix}
        candidates={coverLookup.candidates}
        googleSearchUrl={buildGoogleCoverSearchUrl(currentRecord)}
        isLoading={coverLookup.isLoading}
        errorMessage={coverLookup.errorMessage}
        onAccept={acceptCoverCandidate}
        onClose={closeCoverLookup}
      />
    </div>
  );
}

export default App;
