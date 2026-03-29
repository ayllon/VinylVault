export type SelectOption = { value: string; label: string };
export type CoverSuffix = "cd" | "lp";

export interface RecordData {
  id: number;
  artist: string | null;
  title: string | null;
  format: string | null;
  year: string | null;
  style: string | null;
  country: string | null;
  tracks: string | null;
  credits: string | null;
  edition: string | null;
  notes: string | null;
  cd_cover_path: string | null;
  lp_cover_path: string | null;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  release_url: string;
  release_name: string | null;
}

export interface CoverContextMenuState {
  x: number;
  y: number;
  suffix: CoverSuffix;
}
