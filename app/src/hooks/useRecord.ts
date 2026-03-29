import { useState } from "react";
import type { RecordData } from "../types";

export function useRecord() {
  const [recordIndex, setRecordIndex] = useState<number>(0);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [currentRecord, setCurrentRecord] = useState<RecordData | null>(null);

  return {
    recordIndex,
    setRecordIndex,
    totalRecords,
    setTotalRecords,
    currentRecord,
    setCurrentRecord,
  };
}
