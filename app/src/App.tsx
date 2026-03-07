import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import Select from "react-select";
import type { CSSObjectWithLabel, Theme, StylesConfig } from "react-select";
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

interface RecordData {
  id: number;
  grupo: string | null;
  titulo: string | null;
  formato: string | null;
  anio: string | null;
  estilo: string | null;
  pais: string | null;
  canciones: string | null;
  creditos: string | null;
  observ: string | null;
  portada_cd_path: string | null;
  portada_lp_path: string | null;
}

interface ImportProgressPayload {
  processed: number;
  total: number;
  percent: number;
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
  const [formatos, setFormatos] = useState<string[]>([]);

  const loadSeqRef = useRef(0);

  const [searchGrupo, setSearchGrupo] = useState<string>("");
  const [searchDisco, setSearchDisco] = useState<string>("");
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

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
      const [g, t, f] = await invoke<[string[], string[], string[]]>(
        "get_groups_and_titles",
      );
      setGroups(g);
      setTitles(t);
      setFormatos(f);
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

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deleteTargetId]);

  async function handleImport() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Microsoft Access", extensions: ["mdb"] }],
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
        if (searchGrupo) {
          col = "GRUPO";
          val = searchGrupo;
        } else if (searchDisco) {
          col = "TITULO";
          val = searchDisco;
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
      alert("No se encontro el registro.");
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

  function getImageSrc(path: string | null | undefined): string {
    if (!path) return "";
    return convertFileSrc(path);
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
        <div className="field-group grupo">
          <label>{t("fields.group")}:</label>
          <input
            type="text"
            value={currentRecord?.grupo || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, grupo: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group pais">
          <label>{t("fields.country")}:</label>
          <input
            type="text"
            value={currentRecord?.pais || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, pais: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>

        <div className="field-group disco">
          <label>{t("fields.album")}:</label>
          <input
            type="text"
            value={currentRecord?.titulo || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, titulo: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group anio">
          <label>{t("fields.year")}:</label>
          <input
            type="text"
            value={currentRecord?.anio || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, anio: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group estilo">
          <label>{t("fields.style")}:</label>
          <input
            type="text"
            value={currentRecord?.estilo || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, estilo: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>
        <div className="field-group formato">
          <label>{t("fields.format")}:</label>
          <Select
            options={formatos.map((f) => ({ value: f, label: f }))}
            value={
              currentRecord?.formato
                ? { value: currentRecord.formato, label: currentRecord.formato }
                : null
            }
            onChange={(option) => {
              if (currentRecord) {
                const updated = {
                  ...currentRecord,
                  formato: option?.value || "",
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

        <div className="field-group observ">
          <label>{t("fields.observations")}:</label>
          <input
            type="text"
            value={currentRecord?.observ || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({ ...currentRecord, observ: e.target.value })
                : null
            }
            onBlur={handleSave}
          />
        </div>

        <div className="field-group canciones">
          <label>{t("fields.songs")}</label>
          <textarea
            value={currentRecord?.canciones || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({
                    ...currentRecord,
                    canciones: e.target.value,
                  })
                : null
            }
            onBlur={handleSave}
          ></textarea>
        </div>

        <div className="field-group creditos">
          <label>{t("fields.credits")}</label>
          <textarea
            value={currentRecord?.creditos || ""}
            onChange={(e) =>
              currentRecord
                ? setCurrentRecord({
                    ...currentRecord,
                    creditos: e.target.value,
                  })
                : null
            }
            onBlur={handleSave}
          ></textarea>
        </div>

        <div className="photo-cd-wrapper">
          <div className="photo-label">{t("fields.cd_cover")}</div>
          <div className="photo-box">
            {currentRecord?.portada_cd_path && (
              <img
                src={getImageSrc(currentRecord.portada_cd_path)}
                onError={(e) => (e.currentTarget.style.display = "none")}
                onLoad={(e) => (e.currentTarget.style.display = "block")}
              />
            )}
          </div>
        </div>

        <div className="photo-lp-wrapper">
          <div className="photo-label">{t("fields.lp_cover")}</div>
          <div className="photo-box">
            {currentRecord?.portada_lp_path && (
              <img
                src={getImageSrc(currentRecord.portada_lp_path)}
                onError={(e) => (e.currentTarget.style.display = "none")}
                onLoad={(e) => (e.currentTarget.style.display = "block")}
              />
            )}
          </div>
        </div>

        <div className="action-bar">
          <div className="search-boxes">
            <div className="search-box" style={{ flex: 2 }}>
              <label>{t("search.by_group")}</label>
              <Select
                options={groups.map((g) => ({ value: g, label: g }))}
                value={
                  searchGrupo
                    ? { value: searchGrupo, label: searchGrupo }
                    : null
                }
                onChange={(option) => {
                  const newValue = option?.value || "";
                  setSearchGrupo(newValue);
                  setSearchDisco("");
                  if (newValue) {
                    // Search immediately with the selected value
                    handleSearchClick("GRUPO", newValue);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchGrupo) {
                    handleSearchClick("GRUPO", searchGrupo);
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
                  searchDisco
                    ? { value: searchDisco, label: searchDisco }
                    : null
                }
                onChange={(option) => {
                  const newValue = option?.value || "";
                  setSearchDisco(newValue);
                  setSearchGrupo("");
                  if (newValue) {
                    // Search immediately with the selected value
                    handleSearchClick("TITULO", newValue);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchDisco) {
                    handleSearchClick("TITULO", searchDisco);
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
          onClick={() => setDeleteTargetId(null)}
        >
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(e) => e.stopPropagation()}
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
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
