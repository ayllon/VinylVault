import { useState } from "react";

export function useSearch() {
  const [searchArtist, setSearchArtist] = useState<string>("");
  const [searchAlbum, setSearchAlbum] = useState<string>("");
  const [groups, setGroups] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);

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
  };
}
