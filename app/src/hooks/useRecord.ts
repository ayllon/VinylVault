import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import type { RecordData } from "../types";

export function useRecord() {
  const [recordIndex, setRecordIndex] = useState<number>(0);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [currentRecord, setCurrentRecord] = useState<RecordData | null>(null);
  const loadSeqRef = useRef(0);

  const loadTotalRecords = useCallback(async () => {
    try {
      const total = await invoke<number>("get_total_records");
      setTotalRecords(total);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadRecord = useCallback(async (offset: number) => {
    const seq = ++loadSeqRef.current;
    try {
      const record = await invoke<RecordData>("get_record", { offset });
      if (seq === loadSeqRef.current) {
        setCurrentRecord(record);
      }
    } catch (e) {
      if (seq === loadSeqRef.current) {
        console.error(e);
        setCurrentRecord(null);
      }
    }
  }, []);

  return {
    recordIndex,
    setRecordIndex,
    totalRecords,
    setTotalRecords,
    currentRecord,
    setCurrentRecord,
    loadTotalRecords,
    loadRecord,
  };
}
