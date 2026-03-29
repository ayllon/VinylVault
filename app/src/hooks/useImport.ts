import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

interface ImportProgressPayload {
  processed: number;
  total: number;
  percent: number;
}

export function useImport() {
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProcessed, setImportProcessed] = useState<number>(0);
  const [importTotal, setImportTotal] = useState<number>(0);
  const [importPercent, setImportPercent] = useState<number>(0);

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
