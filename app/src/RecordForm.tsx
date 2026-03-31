import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { RecordData } from "./types";

interface RecordFormProps {
  currentRecord: RecordData | null;
  onRecordChange: (nextRecord: RecordData) => void;
  onSave: (record?: RecordData) => Promise<void> | void;
}

function RecordForm({
  currentRecord,
  onRecordChange,
  onSave,
}: Readonly<RecordFormProps>) {
  const { t } = useTranslation();
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const formatRef = useRef<HTMLDivElement>(null);
  const formatMenuId = "format-dropdown-menu";

  useEffect(() => {
    if (!formatMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) {
        setFormatMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFormatMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [formatMenuOpen]);

  return (
    <>
      <div className="field-group artist">
        <label>{t("fields.group")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.artist || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, artist: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>
      <div className="field-group country">
        <label>{t("fields.country")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.country || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, country: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>

      <div className="field-group album">
        <label>{t("fields.album")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.title || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, title: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>
      <div className="field-group year">
        <label>{t("fields.year")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.year || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, year: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>
      <div className="field-group style">
        <label>{t("fields.style")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.style || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, style: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>
      <div className="field-group format">
        <label>{t("fields.format")}:</label>
        <div className="format-input-wrapper" ref={formatRef}>
          <input
            type="text"
            spellCheck={false}
            value={currentRecord?.format || ""}
            onChange={(e) =>
              currentRecord
                ? onRecordChange({ ...currentRecord, format: e.target.value })
                : null
            }
            onBlur={() => onSave()}
          />
          <button
            type="button"
            className="format-dropdown-btn"
            aria-haspopup="listbox"
            aria-expanded={formatMenuOpen}
            aria-controls={formatMenuId}
            onClick={() => setFormatMenuOpen((o) => !o)}
          >
            ▾
          </button>
          {formatMenuOpen && (
            <ul
              id={formatMenuId}
              className="format-dropdown-menu"
              role="listbox"
            >
              {[t("formats.cd"), t("formats.vinyl")].map((opt) => (
                <li
                  key={opt}
                  role="option"
                  aria-selected={currentRecord?.format === opt}
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (currentRecord) {
                      const updated = { ...currentRecord, format: opt };
                      onRecordChange(updated);
                      onSave(updated);
                    }
                    setFormatMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (currentRecord) {
                        const updated = { ...currentRecord, format: opt };
                        onRecordChange(updated);
                        onSave(updated);
                      }
                      setFormatMenuOpen(false);
                    }
                  }}
                >
                  {opt}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="field-group edition">
        <label>{t("fields.edition")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.edition || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, edition: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>

      <div className="field-group notes">
        <label>{t("fields.observations")}:</label>
        <input
          type="text"
          spellCheck={false}
          value={currentRecord?.notes || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, notes: e.target.value })
              : null
          }
          onBlur={() => onSave()}
        />
      </div>

      <div className="field-group tracks">
        <label>{t("fields.songs")}</label>
        <textarea
          value={currentRecord?.tracks || ""}
          spellCheck={false}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({
                ...currentRecord,
                tracks: e.target.value,
              })
              : null
          }
          onBlur={() => onSave()}
        ></textarea>
      </div>

      <div className="field-group credits">
        <label>{t("fields.credits")}</label>
        <textarea
          value={currentRecord?.credits || ""}
          spellCheck={false}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({
                ...currentRecord,
                credits: e.target.value,
              })
              : null
          }
          onBlur={() => onSave()}
        ></textarea>
      </div>
    </>
  );
}

export default RecordForm;
