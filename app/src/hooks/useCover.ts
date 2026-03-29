import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  importCoverFromUrl,
  searchCoverCandidates,
  type CoverCandidate,
} from "../coverLookup";
import type { CoverContextMenuState, CoverSuffix, RecordData } from "../types";

const CONTEXT_MENU_VIEWPORT_MARGIN = 8;

interface CoverLookupState {
  isOpen: boolean;
  suffix: CoverSuffix | null;
  isLoading: boolean;
  errorMessage: string | null;
  candidates: CoverCandidate[];
}

interface UseCoverParams {
  currentRecord: RecordData | null;
  setCurrentRecord: Dispatch<SetStateAction<RecordData | null>>;
}

export function useCover({ currentRecord, setCurrentRecord }: Readonly<UseCoverParams>) {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<CoverContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lookupSeqRef = useRef(0);
  const [coverImportingSuffix, setCoverImportingSuffix] = useState<CoverSuffix | null>(null);
  const [coverLookup, setCoverLookup] = useState<CoverLookupState>({
    isOpen: false,
    suffix: null,
    isLoading: false,
    errorMessage: null,
    candidates: [],
  });

  useLayoutEffect(() => {
    if (!contextMenu) return;

    const clampContextMenuToViewport = () => {
      const menuElement = contextMenuRef.current;
      if (!(menuElement instanceof HTMLElement)) {
        return;
      }

      const rect = menuElement.getBoundingClientRect();
      const maxX = Math.max(
        CONTEXT_MENU_VIEWPORT_MARGIN,
        window.innerWidth - rect.width - CONTEXT_MENU_VIEWPORT_MARGIN,
      );
      const maxY = Math.max(
        CONTEXT_MENU_VIEWPORT_MARGIN,
        window.innerHeight - rect.height - CONTEXT_MENU_VIEWPORT_MARGIN,
      );

      const nextX = Math.min(Math.max(contextMenu.x, CONTEXT_MENU_VIEWPORT_MARGIN), maxX);
      const nextY = Math.min(Math.max(contextMenu.y, CONTEXT_MENU_VIEWPORT_MARGIN), maxY);

      if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
        setContextMenu((prev) =>
          prev
            ? {
              ...prev,
              x: nextX,
              y: nextY,
            }
            : prev,
        );
      }
    };

    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      const target = event.target as Node | null;
      if (contextMenuRef.current && target && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    const handleResize = () => {
      clampContextMenuToViewport();
    };

    globalThis.addEventListener("mousedown", handleOutsideClick);
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("resize", handleResize);

    clampContextMenuToViewport();
    const menuElement = contextMenuRef.current;
    if (menuElement instanceof HTMLElement) {
      menuElement.focus();
    }

    return () => {
      globalThis.removeEventListener("mousedown", handleOutsideClick);
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("resize", handleResize);
    };
  }, [contextMenu]);

  function handleCoverContextMenu(e: ReactMouseEvent<HTMLButtonElement>, suffix: CoverSuffix) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, suffix });
  }

  async function pasteFromClipboard(suffix: CoverSuffix) {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const recordId = currentRecord.id;

    try {
      const newPath = await invoke<string>("save_cover_paste_from_clipboard", {
        recordId,
        suffix,
      });

      setCurrentRecord((previousRecord) => {
        if (previousRecord?.id !== recordId) {
          return previousRecord;
        }

        if (suffix === "cd") {
          return { ...previousRecord, cd_cover_path: newPath };
        }

        return { ...previousRecord, lp_cover_path: newPath };
      });
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      alert(t("cover_paste_error", { type: suffix }));
    }
    setContextMenu(null);
  }

  async function copyToClipboard(suffix: CoverSuffix) {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const coverPath = suffix === "cd" ? currentRecord.cd_cover_path : currentRecord.lp_cover_path;
    if (!coverPath) {
      setContextMenu(null);
      return;
    }

    try {
      await invoke("copy_cover_to_clipboard", { coverPath });
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
      alert(t("cover_copy_error", { type: suffix, error: String(error) }));
    }
  }

  async function copyCoverFilePath(suffix: CoverSuffix) {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const coverPath = suffix === "cd" ? currentRecord.cd_cover_path : currentRecord.lp_cover_path;
    if (!coverPath) {
      setContextMenu(null);
      return;
    }

    try {
      await writeText(coverPath);
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to copy cover file path:", error);
      alert(t("cover_path_copy_error", { error: String(error) }));
    }
  }

  async function deleteCover(suffix: CoverSuffix) {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const recordId = currentRecord.id;

    try {
      await invoke("delete_cover_for_record", {
        recordId,
        suffix,
      });

      setCurrentRecord((previousRecord) => {
        if (previousRecord?.id !== recordId) {
          return previousRecord;
        }

        if (suffix === "cd") {
          return { ...previousRecord, cd_cover_path: null };
        }

        return { ...previousRecord, lp_cover_path: null };
      });
    } catch (error) {
      console.error("Failed to delete cover:", error);
      alert(t("cover_delete_error", { type: suffix, error: String(error) }));
    }

    setContextMenu(null);
  }

  async function openCoverLookup(suffix: CoverSuffix) {
    if (!currentRecord) {
      setContextMenu(null);
      return;
    }

    const lookupSeq = ++lookupSeqRef.current;

    setContextMenu(null);
    setCoverLookup({
      isOpen: true,
      suffix,
      isLoading: true,
      errorMessage: null,
      candidates: [],
    });

    try {
      const candidates = await searchCoverCandidates({
        artist: currentRecord.artist,
        title: currentRecord.title,
        year: currentRecord.year,
        format: currentRecord.format,
        country: currentRecord.country,
      });

      if (lookupSeq !== lookupSeqRef.current) {
        return;
      }

      setCoverLookup({
        isOpen: true,
        suffix,
        isLoading: false,
        errorMessage: null,
        candidates,
      });
    } catch (error) {
      if (lookupSeq !== lookupSeqRef.current) {
        return;
      }

      console.error("Failed to search for cover candidates:", error);
      setCoverLookup({
        isOpen: true,
        suffix,
        isLoading: false,
        errorMessage: t("cover_lookup.search_error", { error: String(error) }),
        candidates: [],
      });
    }
  }

  function closeCoverLookup() {
    lookupSeqRef.current += 1;

    setCoverLookup({
      isOpen: false,
      suffix: null,
      isLoading: false,
      errorMessage: null,
      candidates: [],
    });
  }

  async function acceptCoverCandidate(candidate: CoverCandidate) {
    if (!currentRecord || !coverLookup.suffix) {
      return;
    }

    const recordId = currentRecord.id;
    const selectedSuffix = coverLookup.suffix;
    closeCoverLookup();
    setCoverImportingSuffix(selectedSuffix);

    try {
      const newPath = await importCoverFromUrl(
        recordId,
        selectedSuffix,
        candidate.image_url,
      );

      setCurrentRecord((previousRecord) => {
        if (previousRecord?.id !== recordId) {
          return previousRecord;
        }

        if (selectedSuffix === "cd") {
          return { ...previousRecord, cd_cover_path: newPath };
        }

        return { ...previousRecord, lp_cover_path: newPath };
      });
    } catch (error) {
      console.error("Failed to import selected cover:", error);
      alert(t("cover_lookup.import_error", { error: String(error) }));
    } finally {
      setCoverImportingSuffix(null);
    }
  }

  return {
    contextMenu,
    contextMenuRef,
    coverImportingSuffix,
    coverLookup,
    handleCoverContextMenu,
    pasteFromClipboard,
    copyToClipboard,
    copyCoverFilePath,
    deleteCover,
    openCoverLookup,
    closeCoverLookup,
    acceptCoverCandidate,
  };
}
