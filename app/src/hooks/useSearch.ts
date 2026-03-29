import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

interface GroupsAndTitlesData {
  groups: string[];
  titles: string[];
  formatos: string[];
}

export function useSearch() {
  const [searchArtist, setSearchArtist] = useState<string>("");
  const [searchAlbum, setSearchAlbum] = useState<string>("");
  const [groups, setGroups] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);

  const loadComboboxes = useCallback(async () => {
    try {
      const data = await invoke<GroupsAndTitlesData>("get_groups_and_titles");
      setGroups(data.groups);
      setTitles(data.titles);
      setFormats(data.formatos);
    } catch (e) {
      console.error("Failed to load groups, titles, and formats", e);
    }
  }, []);

  const findRecordOffset = useCallback(async (column: string, value: string): Promise<number> => {
    return invoke<number>("find_record_offset", {
      column,
      value,
    });
  }, []);

  return {
    searchArtist,
    setSearchArtist,
    searchAlbum,
    setSearchAlbum,
    groups,
    setGroups,
    titles,
    setTitles,
    formats,
    setFormats,
    loadComboboxes,
    findRecordOffset,
  };
}
