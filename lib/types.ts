export type TravelVibe = 'cultural' | 'party' | 'outdoors' | 'mixed';
export type BudgetRange = 'budget' | 'mid' | 'luxury';
export type TripStatus = 'planning' | 'confirmed' | 'completed';
export type IdeaStatus = 'idea' | 'confirmed';
export type MemberRole = 'owner' | 'member';

// ─── Database row types ────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  travel_vibe: TravelVibe[] | null;       // multi-select array
  group_size_pref: number | null;
  budget_range: BudgetRange[] | null;     // multi-select array
  travel_frequency: string | null;
  onboarded: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  created_by: string;
  invite_code: string;
  status: TripStatus;
  cover_image: string | null;
  people_count: number | null;
  parent_trip_id: string | null;
  split_note: string | null;
  is_public: boolean;
  created_at: string;
}

export interface TripStop {
  id: string;
  trip_id: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  order_index: number;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string | null;
  display_name: string;
  role: MemberRole;
  avatar_url: string | null;
  joined_at: string;
}

export interface TripTab {
  id: string;
  trip_id: string;
  name: string;
  icon: string;
  order_index: number;
  created_by: string | null;
}

export interface Idea {
  id: string;
  tab_id: string;
  trip_id: string;
  created_by: string | null;
  creator_name: string | null;
  title: string;
  description: string | null;
  url: string | null;
  estimated_cost: number | null;
  currency: string;
  status: IdeaStatus;
  confirmed_at: string | null;
  vote_count: number;
  order_index: number;
  created_at: string;
}

export interface IdeaComment {
  id: string;
  idea_id: string;
  user_id: string;
  display_name: string;
  content: string;
  created_at: string;
}

export interface IdeaVote {
  id: string;
  idea_id: string;
  user_id: string | null;
  member_id: string | null;
  created_at: string;
}

export type TransportType = 'flight' | 'train' | 'bus' | 'car' | 'ferry';

export interface Flight {
  id: string;
  trip_id: string;
  stop_id: string | null;
  transport_type: TransportType;  // new — default 'flight'
  airline: string | null;         // also used as "operator" for non-flights
  flight_number: string | null;   // also used as "reference" for non-flights
  departure_airport: string;      // also used as generic "from" point
  arrival_airport: string;        // also used as generic "to" point
  departure_time: string | null;
  arrival_time: string | null;
  price: number | null;
  currency: string;
  added_by: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  trip_id: string;
  name: string;
  url: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface TripExpense {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string;
  paid_by_user_id: string | null;
  paid_by_name: string;
  created_at: string;
}

export interface PackingItem {
  id: string;
  trip_id: string;
  title: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  checked: boolean;
  checked_by_name: string | null;
  created_by: string | null;
  created_at: string;
}

export type ItineraryCategory = 'transport' | 'accommodation' | 'food' | 'activity' | 'nightlife' | 'other';

export interface ItineraryItem {
  id: string;
  trip_id: string;
  date: string;           // YYYY-MM-DD
  title: string;
  description: string | null;
  time_start: string | null; // "09:00"
  category: ItineraryCategory;
  idea_id: string | null;
  order_index: number;
  created_by: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  trip_id: string | null;
  type: string;
  message: string;
  trip_name: string | null;
  read: boolean;
  created_at: string;
}

// ─── Extended / joined types ──────────────────────────────────────────────────

export interface TripWithStops extends Trip {
  stops: TripStop[];
  member_count: number;
  user_role?: MemberRole;
}

export interface TabWithIdeas extends TripTab {
  ideas: Idea[];
  idea_count: number;
  confirmed_count: number;
}

// ─── Supabase Database type (simplified) ─────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      trips: { Row: Trip; Insert: Partial<Trip>; Update: Partial<Trip> };
      trip_stops: { Row: TripStop; Insert: Partial<TripStop>; Update: Partial<TripStop> };
      trip_members: { Row: TripMember; Insert: Partial<TripMember>; Update: Partial<TripMember> };
      trip_tabs: { Row: TripTab; Insert: Partial<TripTab>; Update: Partial<TripTab> };
      ideas: { Row: Idea; Insert: Partial<Idea>; Update: Partial<Idea> };
      idea_votes: { Row: IdeaVote; Insert: Partial<IdeaVote>; Update: Partial<IdeaVote> };
      flights: { Row: Flight; Insert: Partial<Flight>; Update: Partial<Flight> };
      documents: { Row: Document; Insert: Partial<Document>; Update: Partial<Document> };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};
