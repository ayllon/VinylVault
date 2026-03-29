import { invoke } from "@tauri-apps/api/core";
import type { CoverSuffix } from "./types";


export interface CoverSearchQuery {
  artist: string | null;
  title: string | null;
  year: string | null;
  format: string | null;
  country: string | null;
}

export interface CoverCandidate {
  release_id: string;
  release_group_id: string | null;
  title: string;
  artist: string;
  date: string | null;
  country: string | null;
  format: string | null;
  score: number;
  thumbnail_url: string;
  image_url: string;
  source_url: string;
}

export async function searchCoverCandidates(query: CoverSearchQuery): Promise<CoverCandidate[]> {
  return invoke<CoverCandidate[]>("search_cover_candidates", { query });
}

export async function importCoverFromUrl(
  recordId: number,
  suffix: CoverSuffix,
  imageUrl: string,
): Promise<string> {
  return invoke<string>("import_cover_from_url", {
    recordId,
    suffix,
    imageUrl,
  });
}
export { type CoverSuffix } from "./types";