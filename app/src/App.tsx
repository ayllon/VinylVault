import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
    try {
      const total = await invoke<number>("get_total_records", { dbPath });
      setTotalRecords(total);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadComboboxes() {
    try {
      const [g, t] = await invoke<[string[], string[]]>("get_groups_and_titles", { dbPath });
      setGroups(g);
      setTitles(t);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadRecord(offset: number) {
    try {
      const rec = await invoke<RecordData>("get_record", { offset, dbPath });
      setCurrentRecord(rec);
    } catch (e) {
      console.error(e);
      setCurrentRecord(null);
    }
  }

  async function handleSearchClick() {
    if (!dbPath) return;
    try {
      let col = "";
      let val = "";
      if (searchGrupo) {
        col = "GRUPO"; val = searchGrupo;
      } else if (searchDisco) {
        col = "TITULO"; val = searchDisco;
      } else {
        return;
      }

      const offset = await invoke<number>("find_record_offset", { column: col, value: val, dbPath });
      setRecordIndex(offset);
    } catch (e) {
      alert("Record not found!");
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
          <input type="text" readOnly value={currentRecord?.grupo || ""} />
        </div>
        <div className="field-group pais">
          <label>Pais:</label>
          <input type="text" readOnly value={currentRecord?.pais || ""} />
        </div>

        <div className="field-group disco">
          <label>Disco:</label>
          <input type="text" readOnly value={currentRecord?.titulo || ""} />
        </div>
        <div className="field-group anio">
          <label>Año:</label>
          <input type="text" readOnly value={currentRecord?.anio || ""} />
        </div>
        <div className="field-group estilo">
          <label>Estilo:</label>
          <input type="text" readOnly value={currentRecord?.estilo || ""} />
        </div>
        <div className="field-group formato">
          <label>Formato:</label>
          <input type="text" readOnly value={currentRecord?.formato || ""} />
        </div>

        <div className="field-group observ">
          <label>OBSERV:</label>
          <input type="text" readOnly value={currentRecord?.observ || ""} />
        </div>

        <div className="field-group canciones">
          <label>CANCIONES</label>
          <textarea readOnly value={currentRecord?.canciones || ""}></textarea>
        </div>

        <div className="field-group creditos">
          <label>CREDITOS</label>
          <textarea readOnly value={currentRecord?.creditos || ""}></textarea>
        </div>

        <div className="photo-cd-wrapper">
          <div className="photo-label">Portada CD</div>
          <div className="photo-box">
            {currentRecord && <img src={getImagePath("cd")} onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />}
          </div>
        </div>

        <div className="photo-lp-wrapper">
          <div className="photo-label">Portada LP</div>
          <div className="photo-box">
            {currentRecord && <img src={getImagePath("lp")} onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />}
          </div>
        </div>

        <div className="action-bar">
          <div className="search-boxes">
            <div className="search-box" style={{ flex: 2 }}>
              <label>Buscar por grupo</label>
              <div style={{ display: 'flex' }}>
                <select value={searchGrupo} onChange={(e) => { setSearchGrupo(e.target.value); setSearchDisco(""); }} style={{ flex: 1 }}>
                  <option value="">-- Select --</option>
                  {groups.map((g, i) => <option key={i} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div className="search-box" style={{ flex: 2 }}>
              <label>Buscar por disco</label>
              <div style={{ display: 'flex' }}>
                <select value={searchDisco} onChange={(e) => { setSearchDisco(e.target.value); setSearchGrupo(""); }} style={{ flex: 1 }}>
                  <option value="">-- Select --</option>
                  {titles.map((t, i) => <option key={i} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
              <button onClick={handleSearchClick} title="Buscar">🔍</button>
            </div>
          </div>
        </div>

      </div>

      <div className="nav-bar-bottom">
        <span>Registro:</span>
        <button onClick={() => setRecordIndex(0)} disabled={recordIndex === 0}>⏮</button>
        <button onClick={() => setRecordIndex(recordIndex - 1)} disabled={recordIndex === 0}>◀</button>
        <span className="record-count">{recordIndex + 1} de {totalRecords}</span>
        <button onClick={() => setRecordIndex(recordIndex + 1)} disabled={recordIndex >= totalRecords - 1}>▶</button>
        <button onClick={() => setRecordIndex(totalRecords - 1)} disabled={recordIndex >= totalRecords - 1}>⏭</button>
      </div>
    </div>
  );
}

export default App;
