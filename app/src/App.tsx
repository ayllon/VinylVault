import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Select from "react-select";
import "./App.css";

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

function sanitizeKey(text: string | null | undefined): string {
  if (!text) return "";
  let val = text.replace(/^["'\s]+|["'\s]+$/g, "");
  let normalized = val.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let lower = normalized.toLowerCase();
  let sanitized = lower.replace(/[^a-z0-9]/g, "_");
  sanitized = sanitized.replace(/^_+|_+$/g, "");
  return sanitized;
}

function App() {
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [recordIndex, setRecordIndex] = useState<number>(0);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [currentRecord, setCurrentRecord] = useState<RecordData | null>(null);

  const [groups, setGroups] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [formatos, setFormatos] = useState<string[]>([]);

  const [searchGrupo, setSearchGrupo] = useState<string>("");
  const [searchDisco, setSearchDisco] = useState<string>("");

  useEffect(() => {
    if (dbPath) {
      loadTotalRecords();
      loadComboboxes();
    }
  }, [dbPath]);

  useEffect(() => {
    if (dbPath && totalRecords > 0) {
      loadRecord(recordIndex);
    }
  }, [recordIndex, totalRecords, dbPath]);

  async function openDatabase() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite", extensions: ["sqlite", "db", "sqlite3"] }],
      });
      if (typeof selected === "string") {
        setDbPath(selected);
        setRecordIndex(0);
      }
    } catch (e) {
      console.error(e);
      alert("Error opening database");
    }
  }

  async function loadTotalRecords() {
    if (!dbPath) return;
    try {
      const total = await invoke<number>("get_total_records", { dbPath });
      setTotalRecords(total);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadComboboxes() {
    if (!dbPath) return;
    try {
      const [g, t, f] = await invoke<[string[], string[], string[]]>(
        "get_groups_and_titles",
        { dbPath },
      );
      setGroups(g);
      setTitles(t);
      setFormatos(f);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadRecord(offset: number) {
    if (!dbPath) return;
    try {
      const rec = await invoke<RecordData>("get_record", { offset, dbPath });
      setCurrentRecord(rec);
    } catch (e) {
      console.error(e);
      setCurrentRecord(null);
    }
  }

  async function handleSearchClick(column?: string, value?: string) {
    if (!dbPath) return;
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
        dbPath,
      });
      setRecordIndex(offset);
    } catch (e) {
      alert("Record not found!");
    }
  }

  // Silent autosaver function
  async function handleSave() {
    if (!dbPath || !currentRecord) return;
    try {
      await invoke("update_record", { record: currentRecord, dbPath });
      loadComboboxes();
    } catch (e) {
      console.error("Auto-save failed:", e);
    }
  }

  async function handleAdd() {
    if (!dbPath) return;
    try {
      const newIndex = await invoke<number>("add_record", { dbPath });
      await loadTotalRecords();
      setRecordIndex(newIndex);
    } catch (e) {
      console.error(e);
      alert("Error adding record: " + e);
    }
  }

  async function handleDelete() {
    if (!dbPath || !currentRecord) return;
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await invoke("delete_record", { id: currentRecord.id, dbPath });
      await loadTotalRecords();
      setRecordIndex(0);
      loadComboboxes();
    } catch (e) {
      console.error(e);
      alert("Error deleting record: " + e);
    }
  }

  function getImagePath(type: "cd" | "lp"): string {
    if (!dbPath || !currentRecord || !currentRecord.titulo) return "";
    const separator = dbPath.includes("\\") ? "\\" : "/";
    const dbDir = dbPath.substring(0, dbPath.lastIndexOf(separator));

    const key = sanitizeKey(currentRecord.titulo);
    if (key.length < 2) return "";

    const nested = key.substring(0, 2);
    const fileName = `${key}_${type}.jpeg`;

    const fullPath = `${dbDir}${separator}covers${separator}${nested}${separator}${fileName}`;
    return convertFileSrc(fullPath);
  }

  if (!dbPath) {
    return (
      <div className="auth-overlay">
        <h2>Registro Musical</h2>
        <p>Please select the discos.sqlite database file to start.</p>
        <button onClick={openDatabase}>Open Database</button>
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
                setCurrentRecord({
                  ...currentRecord,
                  formato: option?.value || "",
                });
                handleSave();
              }
            }}
            isSearchable
            placeholder="Select or type formato..."
            styles={{
              control: (base: any) => ({
                ...base,
                border: "1px solid #cbd5e0",
                boxShadow: "none",
                ":hover": {
                  border: "1px solid #cbd5e0",
                },
              }),
              menu: (base: any) => ({
                ...base,
                zIndex: 10000,
              }),
              menuPortal: (base: any) => ({
                ...base,
                zIndex: 10000,
              }),
            }}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            menuPlacement="auto"
            menuShouldBlockScroll={true}
            theme={(theme: any) => ({
              ...theme,
              borderRadius: 4,
              colors: {
                ...theme.colors,
                primary: "#3182ce",
                primary25: "#ebf8ff",
              },
            })}
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
            {currentRecord && (
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
            {currentRecord && (
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
                styles={{
                  control: (base: any) => ({
                    ...base,
                    border: "1px solid #cbd5e0",
                    boxShadow: "none",
                    ":hover": {
                      border: "1px solid #cbd5e0",
                    },
                  }),
                  menu: (base: any) => ({
                    ...base,
                    zIndex: 10000,
                  }),
                  menuPortal: (base: any) => ({
                    ...base,
                    zIndex: 10000,
                  }),
                }}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                menuShouldBlockScroll={true}
                theme={(theme: any) => ({
                  ...theme,
                  borderRadius: 4,
                  colors: {
                    ...theme.colors,
                    primary: "#3182ce",
                    primary25: "#ebf8ff",
                  },
                })}
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
                styles={{
                  control: (base: any) => ({
                    ...base,
                    border: "1px solid #cbd5e0",
                    boxShadow: "none",
                    ":hover": {
                      border: "1px solid #cbd5e0",
                    },
                  }),
                  menu: (base: any) => ({
                    ...base,
                    zIndex: 10000,
                  }),
                  menuPortal: (base: any) => ({
                    ...base,
                    zIndex: 10000,
                  }),
                }}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                menuShouldBlockScroll={true}
                theme={(theme: any) => ({
                  ...theme,
                  borderRadius: 4,
                  colors: {
                    ...theme.colors,
                    primary: "#3182ce",
                    primary25: "#ebf8ff",
                  },
                })}
              />
            </div>

            <div style={{ alignSelf: "flex-end", paddingBottom: "2px" }}>
              {/* Search button removed - search happens automatically on selection */}
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

        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          <button
            onClick={handleAdd}
            style={{
              backgroundColor: "#48bb78",
              color: "white",
              padding: "4px 12px",
              border: "none",
              fontWeight: "bold",
            }}
          >
            ➕ Añadir
          </button>
          <button
            onClick={handleDelete}
            style={{
              backgroundColor: "#f56565",
              color: "white",
              padding: "4px 12px",
              border: "none",
              fontWeight: "bold",
            }}
          >
            🗑 Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
