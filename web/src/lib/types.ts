export type Status = 'watching' | 'finished' | 'want' | 'dropped';

export interface Profile {
  id: string;
  name: string;
  avatar: string | null;
  color: string | null;
  services: string[];
  updated_at: number;
  hidden?: boolean;
}

export interface Season {
  season_number: number;
  episode_count: number;
  name: string;
  air_year?: number | null;
}

export interface Title {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  seasons: Season[];
  episode_count: number | null;
  runtime: number | null;
  providers: string[];
  overview: string | null;
  cast: string[];
  cast_meta?: { name: string; photo: string | null }[];
  imdb_id?: string | null;
  tmdb_status?: string | null;
  refreshed_at?: number | null;
  new_season_at?: number | null;
  added_by: string | null;
  created_at: number;
}

export interface Rating {
  title_id: number;
  user_id: string;
  score: number | null;
  status: Status | null;
  note: string | null;
  service: string | null;
  seasons: number[];
  updated_at: number;
}

export interface Recommendation {
  id: string;
  from_user: string;
  to_user: string;
  title_id: number;
  note: string | null;
  dismissed: boolean;
  created_at: number;
}

export interface Reaction {
  title_id: number;
  user_id: string;
  emoji: string;
  created_at: number;
}

export interface Activity {
  id: string;
  type: string;
  user_id: string;
  title_id: number | null;
  meta: Record<string, unknown>;
  created_at: number;
}

export interface Follow {
  follower: string;
  followee: string;
  created_at: number;
}

export interface Comment {
  id: string;
  title_id: number;
  user_id: string;
  text: string;
  created_at: number;
}

export interface CommentReaction {
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: number;
}

export interface Snapshot {
  profiles: Profile[];
  titles: Title[];
  ratings: Rating[];
  recommendations: Recommendation[];
  reactions: Reaction[];
  activity: Activity[];
  follows: Follow[];
  comments: Comment[];
  comment_reactions: CommentReaction[];
}

export interface SearchResult {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  providers?: string[];
}

export const STATUS_LABELS: Record<Status, string> = {
  watching: 'Mee bezig',
  finished: 'Gezien',
  want: 'Wishlist',
  dropped: 'Afgehaakt',
};

export const STATUS_ORDER: Status[] = ['finished', 'watching', 'want', 'dropped'];

export const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
export const POSTER_SMALL = 'https://image.tmdb.org/t/p/w185';
export const PERSON_IMG = 'https://image.tmdb.org/t/p/w185';

// Bouw de juiste poster-URL. TMDb levert een pad (bijv. "/abc.jpg"); andere
// bronnen (TVmaze) of een geüploade cover leveren een volledige URL of data-URI.
export function posterUrl(path: string | null | undefined, size: 'base' | 'small' = 'base'): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/uploads/')) return path;
  return (size === 'small' ? POSTER_SMALL : POSTER_BASE) + path;
}
