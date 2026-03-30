import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CSSObjectWithLabel, Theme, StylesConfig } from "react-select";
import CoverLookupDialog from "./CoverLookupDialog";
import CoverPanel from "./CoverPanel";
import NavigationBar from "./NavigationBar";
import RecordForm from "./RecordForm";
import { buildGoogleCoverSearchUrl, getImageSrc } from "./appUtils";
import { useCover } from "./hooks/useCover";
import { useImport } from "./hooks/useImport";
import { useRecord } from "./hooks/useRecord";
import { useSearch } from "./hooks/useSearch";
import type { RecordData, SelectOption, UpdateInfo } from "./types";
import "./App.css";

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

function App() {
  const { t } = useTranslation();
  const [isDbEmpty, setIsDbEmpty] = useState<boolean | null>(null);
  const {
    isImporting,
    setIsImporting,
    importProcessed,
    setImportProcessed,
    importTotal,
    setImportTotal,
    importPercent,
    setImportPercent,
  } = useImport();
  const {
    recordIndex,
    setRecordIndex,
    totalRecords,
    currentRecord,
    setCurrentRecord,
    loadTotalRecords,
    loadRecord,
  } = useRecord();
  const {
    searchArtist,
    setSearchArtist,
    searchAlbum,
    setSearchAlbum,
    groups,
    titles,
    loadComboboxes,
    findRecordOffset,
  } = useSearch();
  const {
    contextMenu,
    contextMenuRef,
    coverImportingSuffix,
    coverLookup,
    handleCoverContextMenu,
    pasteFromClipboard,
    copyToClipboard,
    copyCoverFilePath,
    deleteCover,
    openCoverLookup,
    closeCoverLookup,
    acceptCoverCandidate,
  } = useCover({ currentRecord, setCurrentRecord });

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

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
  }, [recordIndex, totalRecords, isDbEmpty, loadRecord]);

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

      if (!col || !val) {
        return;
      }

      const offset = await findRecordOffset(col, val);
      setRecordIndex(offset);
    } catch {
      alert(t("errors.record_not_found"));
    }
  }

  // Silent autosaver function
  async function handleSave(record?: RecordData) {
    const toSave = record ?? currentRecord;
    if (!toSave) return;
    try {
      await invoke("update_record", { record: toSave });
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

  const navigationBarProps = {
    groups,
    titles,
    searchArtist,
    searchAlbum,
    selectStyles: SELECT_STYLES,
    selectTheme: SELECT_THEME,
    recordIndex,
    totalRecords,
    updateInfo,
    onSearchArtistChange: setSearchArtist,
    onSearchAlbumChange: setSearchAlbum,
    onSearchArtist: (value: string) => handleSearchClick("artist", value),
    onSearchAlbum: (value: string) => handleSearchClick("title", value),
    onFirstRecord: () => setRecordIndex(0),
    onPreviousRecord: () => setRecordIndex(recordIndex - 1),
    onNextRecord: () => setRecordIndex(recordIndex + 1),
    onLastRecord: () => setRecordIndex(totalRecords - 1),
    onOpenReleasePage: handleOpenReleasePage,
    onAdd: handleAdd,
    onDelete: handleDelete,
  };

  return (
    <div className="form-container">
      <div className="form-body">
        <RecordForm
          currentRecord={currentRecord}
          onRecordChange={(nextRecord) => setCurrentRecord(nextRecord)}
          onSave={handleSave}
        />

        <CoverPanel
          currentRecord={currentRecord}
          coverImportingSuffix={coverImportingSuffix}
          contextMenu={contextMenu}
          contextMenuRef={contextMenuRef}
          getImageSrc={getImageSrc}
          onOpenContextMenu={handleCoverContextMenu}
          onOpenCoverLookup={openCoverLookup}
          onPasteFromClipboard={pasteFromClipboard}
          onCopyToClipboard={copyToClipboard}
          onCopyCoverPath={copyCoverFilePath}
          onDeleteCover={deleteCover}
        />

        <NavigationBar {...navigationBarProps} showBottomBar={false} />
      </div>

      <NavigationBar {...navigationBarProps} showSearchControls={false} />

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
