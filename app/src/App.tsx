import { useState, useEffect, useRef, useCallback } from "react";
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
}

interface ImportProgressPayload {
  processed: number;
  total: number;
  percent: number;
}

function sanitizeKey(text: string | null | undefined): string {
  if (!text) return "";
  const val = text.replaceAll(/^["'\s]+|["'\s]+$/g, "");
  const normalized = val.normalize("NFKD").replaceAll(/[\u0300-\u036f]/g, "");
  const lower = normalized.toLowerCase();
  const sanitized = lower.replaceAll(/[^a-z0-9]/g, "_").replaceAll(/^_+|_+$/g, "");
  return sanitized;
}

function App() {
  const [isDbEmpty, setIsDbEmpty] = useState<boolean | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProcessed, setImportProcessed] = useState<number>(0);
  const [importTotal, setImportTotal] = useState<number>(0);
  const [importPercent, setImportPercent] = useState<number>(0);
  const [coversDir, setCoversDir] = useState<string>("");
  const [recordIndex, setRecordIndex] = useState<number>(0);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [currentRecord, setCurrentRecord] = useState<RecordData | null>(null);

  const [groups, setGroups] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [formatos, setFormatos] = useState<string[]>([]);

  const loadSeqRef = useRef(0);

  const [searchGrupo, setSearchGrupo] = useState<string>("");
  const [searchDisco, setSearchDisco] = useState<string>("");

  // Check if DB is empty on mount
  useEffect(() => {
    async function checkDb() {
      try {
        const empty = await invoke<boolean>("is_db_empty");
        setIsDbEmpty(empty);
        if (!empty) {
          const dir = await invoke<string>("get_covers_dir");
          setCoversDir(dir);
        }
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
          alert(`Successfully imported ${count} records!`);
          const dir = await invoke<string>("get_covers_dir");
          setCoversDir(dir);
          setIsDbEmpty(false);
          setRecordIndex(0);
        } catch (e) {
          console.error(e);
          alert("Error importing database: " + e);
        } finally {
          setIsImporting(false);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Error opening file dialog");
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
      alert("Record not found!");
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
      alert("Error adding record: " + e);
    }
  }

  async function handleDelete() {
    if (!currentRecord) return;
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await invoke("delete_record", { id: currentRecord.id });
      await loadTotalRecords();
      setRecordIndex(0);
      await loadComboboxes();
    } catch (e) {
      console.error(e);
      alert("Error deleting record: " + e);
    }
  }

  function getImagePath(type: "cd" | "lp"): string {
    if (!coversDir || !currentRecord || !currentRecord.titulo) return "";

    const key = sanitizeKey(currentRecord.titulo);
    if (key.length < 2) return "";

    const nested = key.substring(0, 2);
    const fileName = `${key}_${type}.jpeg`;
    const separator = coversDir.includes("\\") ? "\\" : "/";

    const fullPath = `${coversDir}${separator}${nested}${separator}${fileName}`;
    return convertFileSrc(fullPath);
  }

  if (isDbEmpty === null) {
    return (
      <div className="auth-overlay">
        <h2>Registro Musical</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (isDbEmpty) {
    return (
      <div className="auth-overlay">
        <h2>Registro Musical</h2>
        {isImporting ? (
          <div className="import-progress">
            <div className="spinner"></div>
            <p>Importing database...</p>
            <progress
              className="progress-track"
              max={100}
              value={Math.max(0, Math.min(100, importPercent))}
            ></progress>
            <p className="import-count">
              {importTotal > 0
                ? `${importProcessed} / ${importTotal} records`
                : "Preparing import..."}
            </p>
            <p className="import-note">This may take a few minutes. Please wait.</p>
          </div>
        ) : (
          <>
            <p>Database is empty. Import an existing MDB file to get started.</p>
            <button onClick={handleImport}>
              Import MDB File
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
          <label>Grupo:</label>
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
          <label>Pais:</label>
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
          <label>Disco:</label>
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
          <label>Año:</label>
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
          <label>Estilo:</label>
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
          <label>Formato:</label>
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
            placeholder="Select or type formato..."
            styles={SELECT_STYLES}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            menuPlacement="auto"
            menuShouldBlockScroll={true}
            theme={SELECT_THEME}
          />
        </div>

        <div className="field-group observ">
          <label>OBSERV:</label>
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
          <label>CANCIONES</label>
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
          <label>CREDITOS</label>
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
          <div className="photo-label">Portada CD</div>
          <div className="photo-box">
            {currentRecord && getImagePath("cd") && (
              <img
                src={getImagePath("cd")}
                onError={(e) => (e.currentTarget.style.display = "none")}
                onLoad={(e) => (e.currentTarget.style.display = "block")}
              />
            )}
          </div>
        </div>

        <div className="photo-lp-wrapper">
          <div className="photo-label">Portada LP</div>
          <div className="photo-box">
            {currentRecord && getImagePath("lp") && (
              <img
                src={getImagePath("lp")}
                onError={(e) => (e.currentTarget.style.display = "none")}
                onLoad={(e) => (e.currentTarget.style.display = "block")}
              />
            )}
          </div>
        </div>

        <div className="action-bar">
          <div className="search-boxes">
            <div className="search-box" style={{ flex: 2 }}>
              <label>Buscar por grupo</label>
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
                placeholder="Search groups..."
                styles={SELECT_STYLES}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                menuShouldBlockScroll={true}
                theme={SELECT_THEME}
              />
            </div>

            <div className="search-box" style={{ flex: 2 }}>
              <label>Buscar por disco</label>
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
                placeholder="Search discs..."
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
        <span>Registro:</span>
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
          {recordIndex + 1} de {totalRecords}
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
            ➕ Añadir
          </button>
          <button onClick={handleDelete} className="btn-delete"
          >
            🗑 Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
