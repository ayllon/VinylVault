import Select from "react-select";
import type { Theme, StylesConfig } from "react-select";
import { useTranslation } from "react-i18next";
import type { RecordData, SelectOption } from "./types";

interface RecordFormProps {
  currentRecord: RecordData | null;
  formats: string[];
  selectStyles: StylesConfig<SelectOption, false>;
  selectTheme: (theme: Theme) => Theme;
  onRecordChange: (nextRecord: RecordData) => void;
  onSave: () => Promise<void> | void;
  onFormatChange: (nextFormat: string) => void;
}

function RecordForm({
  currentRecord,
  formats,
  selectStyles,
  selectTheme,
  onRecordChange,
  onSave,
  onFormatChange,
}: Readonly<RecordFormProps>) {
  const { t } = useTranslation();

  return (
    <>
      <div className="field-group artist">
        <label>{t("fields.group")}:</label>
        <input
          type="text"
          value={currentRecord?.artist || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, artist: e.target.value })
              : null
          }
          onBlur={onSave}
        />
      </div>
      <div className="field-group country">
        <label>{t("fields.country")}:</label>
        <input
          type="text"
          value={currentRecord?.country || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, country: e.target.value })
              : null
          }
          onBlur={onSave}
        />
      </div>

      <div className="field-group album">
        <label>{t("fields.album")}:</label>
        <input
          type="text"
          value={currentRecord?.title || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, title: e.target.value })
              : null
          }
          onBlur={onSave}
        />
      </div>
      <div className="field-group year">
        <label>{t("fields.year")}:</label>
        <input
          type="text"
          value={currentRecord?.year || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, year: e.target.value })
              : null
          }
          onBlur={onSave}
        />
      </div>
      <div className="field-group style">
        <label>{t("fields.style")}:</label>
        <input
          type="text"
          value={currentRecord?.style || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, style: e.target.value })
              : null
          }
          onBlur={onSave}
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
              onFormatChange(option?.value || "");
            }
          }}
          isSearchable
          placeholder={t("search.format_placeholder")}
          styles={selectStyles}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          menuPlacement="auto"
          menuShouldBlockScroll={true}
          theme={selectTheme}
        />
      </div>

      <div className="field-group edition">
        <label>{t("fields.edition")}:</label>
        <input
          type="text"
          value={currentRecord?.edition || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, edition: e.target.value })
              : null
          }
          onBlur={onSave}
        />
      </div>

      <div className="field-group notes">
        <label>{t("fields.observations")}:</label>
        <input
          type="text"
          value={currentRecord?.notes || ""}
          onChange={(e) =>
            currentRecord
              ? onRecordChange({ ...currentRecord, notes: e.target.value })
              : null
          }
          onBlur={onSave}
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
          onBlur={onSave}
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
          onBlur={onSave}
        ></textarea>
      </div>
    </>
  );
}

export default RecordForm;
