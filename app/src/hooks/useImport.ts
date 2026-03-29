import { useState } from "react";

export function useImport() {
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProcessed, setImportProcessed] = useState<number>(0);
  const [importTotal, setImportTotal] = useState<number>(0);
  const [importPercent, setImportPercent] = useState<number>(0);

  return {
    isImporting,
    setIsImporting,
    importProcessed,
    setImportProcessed,
    importTotal,
    setImportTotal,
    importPercent,
    setImportPercent,
  };
}
