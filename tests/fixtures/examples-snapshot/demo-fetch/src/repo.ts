// Snapshot of examples/demo-fetch/src/repo.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
export interface Repo {
  id: string;
  name: string;
  url: string;
  readme: string;
}

export interface RepoSearchResult {
  repos: Repo[];
  query: string;
}
