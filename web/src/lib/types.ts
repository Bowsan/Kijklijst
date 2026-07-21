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
  /** Volledige uitgavedatum ("YYYY-MM-DD"), voor sorteren/tonen. */
  first_air_date?: string | null;
  poster_path: string | null;
  genres: string[];
  seasons: Season[];
  episode_count: number | null;
  runtime: number | null;
  providers: string[];
  overview: string | null;
  cast: string[];
  cast_meta?: { name: string; photo: string | null }[];
  /** Bedenkers/makers van de serie (TMDb created_by). */
  creators?: { name: string; photo: string | null }[];
  imdb_id?: string | null;
  /** IMDb-cijfer via OMDb (op de achtergrond gevuld). */
  imdb_rating?: number | null;
  imdb_votes?: number | null;
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
  /** Kort persoonlijk notitieregeltje (simpele modus). */
  watch_note?: string | null;
  /** Wanneer je deze serie toevoegde (invoervolgorde/tijdlijn). */
  created_at?: number;
  updated_at: number;
}

export interface Recommendation {
  id: string;
  from_user: string;
  to_user: string;
  title_id: number;
  note: string | null;
  dismissed: boolean;
  /** Reactie van de ontvanger: 'thanks' of 'meh'. */
  response?: string | null;
  created_at: number;
}

export interface Message {
  id: string;
  from_user: string;
  to_user: string;
  text: string;
  created_at: number;
  read_at: number | null;
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

export interface ServiceLogo {
  name: string;
  logo_path: string;
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
  service_logos?: ServiceLogo[];
}

export interface SearchResult {
  tmdb_id: number;
  name: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  providers?: string[];
  /** TMDb-publiekscijfer (0-10) en aantal stemmen. */
  vote?: number | null;
  vote_count?: number | null;
  /** IMDb-cijfer (via OMDb), server-side aangevuld. */
  imdb?: number | null;
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
export const SERVICE_LOGO_IMG = 'https://image.tmdb.org/t/p/w92';

/** Logo-URL van een streamingdienst: TMDb-pad, of een volledige/eigen URL. */
export function serviceLogoUrl(path: string): string {
  if (path.startsWith('http') || path.startsWith('/uploads/')) return path;
  return SERVICE_LOGO_IMG + path;
}

// Bouw de juiste poster-URL. TMDb levert een pad (bijv. "/abc.jpg"); andere
// bronnen (TVmaze) of een geüploade cover leveren een volledige URL of data-URI.
export function posterUrl(path: string | null | undefined, size: 'base' | 'small' = 'base'): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/uploads/')) return path;
  return (size === 'small' ? POSTER_SMALL : POSTER_BASE) + path;
}
