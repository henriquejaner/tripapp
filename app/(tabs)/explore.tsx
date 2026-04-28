import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, TextInput, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';

interface PublicTrip {
  id: string;
  name: string;
  cover_image: string | null;
  status: string;
  created_at: string;
  stops: Array<{ destination: string; start_date: string | null; end_date: string | null }>;
  member_count: number;
}

interface AISuggestion {
  destination: string;
  tagline: string;
  vibe: string;
  budget_per_day: number | null;
}

interface WeekendDest {
  destination: string;
  country: string;
  flightHours: string;
  budgetPerDay: number;
  vibe: string;
}

const VIBE_ICON: Record<string, string> = {
  beach: 'sun-o', culture: 'institution', adventure: 'tree',
  nightlife: 'glass', food: 'cutlery', nature: 'leaf', city: 'building-o',
};

const VIBE_COLOR: Record<string, string> = {
  beach: '#38B2E8', culture: '#00A87A', adventure: '#E85438',
  nightlife: '#A855F7', food: '#E8A838', nature: '#22C55E', city: '#6B7280',
};

function formatDateRange(stops: PublicTrip['stops']): string {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first?.start_date) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(first.start_date).toLocaleDateString('en', opts);
  if (last?.end_date && last.end_date !== first.start_date) {
    return `${start} – ${new Date(last.end_date).toLocaleDateString('en', opts)}`;
  }
  return start;
}

function isRecent(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

export default function DiscoverScreen() {
  const [search, setSearch] = useState('');
  const [publicTrips, setPublicTrips] = useState<PublicTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [weekendPicks, setWeekendPicks] = useState<WeekendDest[]>([]);
  const [weekendLoading, setWeekendLoading] = useState(false);
  const [userCity, setUserCity] = useState<string>('Madrid');
  const aiLoaded = useRef(false);
  const weekendLoaded = useRef(false);

  useFocusEffect(useCallback(() => {
    fetchPublicTrips();
    if (!aiLoaded.current) {
      aiLoaded.current = true;
      generateAISuggestions();
    }
    if (!weekendLoaded.current) {
      weekendLoaded.current = true;
      loadWeekendPicks();
    }
  }, []));

  async function loadWeekendPicks() {
    setWeekendLoading(true);
    let city = 'Madrid';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const [geo] = await Location.reverseGeocodeAsync(loc.coords);
        city = geo.city ?? geo.subregion ?? geo.region ?? 'Madrid';
      }
    } catch {}
    setUserCity(city);
    await generateWeekendPicks(city);
    setWeekendLoading(false);
  }

  async function generateWeekendPicks(city: string) {
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
    if (!apiKey) return;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Suggest 8 weekend trip destinations reachable from ${city}. Mix nearby hidden gems (1-2h away by plane or train) with famous popular destinations (2-4h away). Vary the vibes.

Return ONLY a valid raw JSON array (no markdown, no code blocks):
[{"destination":"City","country":"Country","flightHours":"1h 30m","budgetPerDay":75,"vibe":"beach|culture|adventure|nightlife|food|nature|city"}]`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? '[]';
      const clean = text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      setWeekendPicks(JSON.parse(clean));
    } catch {}
  }

  async function fetchPublicTrips() {
    setLoading(true);
    const { data: trips } = await supabase
      .from('trips')
      .select('id, name, cover_image, status, created_at')
      .eq('is_public', true)
      .is('parent_trip_id', null)
      .order('created_at', { ascending: false });

    if (!trips?.length) { setPublicTrips([]); setLoading(false); return; }

    const tripIds = trips.map(t => t.id);
    const [stopsRes, membersRes] = await Promise.all([
      supabase.from('trip_stops').select('trip_id, destination, start_date, end_date, order_index').in('trip_id', tripIds).order('order_index'),
      supabase.from('trip_members').select('trip_id').in('trip_id', tripIds),
    ]);

    const stopsByTrip: Record<string, PublicTrip['stops']> = {};
    stopsRes.data?.forEach(s => {
      if (!stopsByTrip[s.trip_id]) stopsByTrip[s.trip_id] = [];
      stopsByTrip[s.trip_id].push(s);
    });

    const memberCount: Record<string, number> = {};
    membersRes.data?.forEach(m => { memberCount[m.trip_id] = (memberCount[m.trip_id] ?? 0) + 1; });

    setPublicTrips(trips.map(t => ({
      ...t,
      stops: stopsByTrip[t.id] ?? [],
      member_count: memberCount[t.id] ?? 0,
    })));
    setLoading(false);
  }

  async function generateAISuggestions() {
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
    if (!apiKey) return;
    setAiLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let vibe = 'mixed'; let budget = 'mid-range';
      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('travel_vibe, budget_range').eq('id', user.id).single();
        if (profile?.travel_vibe?.length) vibe = Array.isArray(profile.travel_vibe) ? profile.travel_vibe.join(', ') : profile.travel_vibe;
        if (profile?.budget_range?.length) budget = Array.isArray(profile.budget_range) ? profile.budget_range.join(', ') : profile.budget_range;
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Suggest 4 travel destinations for someone who enjoys ${vibe} travel on a ${budget} budget. Be specific, inspiring, and varied in geography.

Return ONLY a valid raw JSON array (no markdown, no code blocks):
[{"destination":"City, Country","tagline":"One compelling sentence about why to go","vibe":"beach|culture|adventure|nightlife|food|nature|city","budget_per_day":80}]`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? '[]';
      const clean = text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      setAiSuggestions(JSON.parse(clean));
    } catch {}
    setAiLoading(false);
  }

  // Aggregate destinations from public trips, sorted by frequency
  const trendingDests = useMemo(() => {
    const counts: Record<string, number> = {};
    publicTrips.forEach(t => {
      t.stops.forEach(s => {
        const key = s.destination.trim();
        counts[key] = (counts[key] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([destination, count]) => ({ destination, count }));
  }, [publicTrips]);

  const filtered = search.trim()
    ? publicTrips.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.stops.some(s => s.destination.toLowerCase().includes(search.toLowerCase()))
      )
    : publicTrips;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <Text style={styles.headerSub}>Get inspired by other travelers</Text>
      </View>

      <View style={styles.searchBox}>
        <FontAwesome name="search" size={13} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search destinations..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome name="times-circle" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          !search ? (
            <>
              {/* AI For You */}
              <View style={styles.sectionRow}>
                <FontAwesome name="magic" size={12} color={Colors.primary} />
                <Text style={styles.sectionTitle}>For you</Text>
              </View>
              {aiLoading ? (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.aiLoadingText}>Finding destinations for you...</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.aiScroll}
                >
                  {aiSuggestions.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.aiCard}
                      onPress={() => setSearch(s.destination.split(',')[0].trim())}
                      activeOpacity={0.82}
                    >
                      <View style={[styles.aiCardIconWrap, { backgroundColor: (VIBE_COLOR[s.vibe] ?? Colors.primary) + '22' }]}>
                        <FontAwesome
                          name={(VIBE_ICON[s.vibe] ?? 'map-marker') as any}
                          size={17} color={VIBE_COLOR[s.vibe] ?? Colors.primary}
                        />
                      </View>
                      <Text style={styles.aiCardDest} numberOfLines={1}>{s.destination}</Text>
                      <Text style={styles.aiCardTagline} numberOfLines={3}>{s.tagline}</Text>
                      {s.budget_per_day != null && (
                        <Text style={styles.aiCardBudget}>~€{s.budget_per_day}/day</Text>
                      )}
                      <View style={styles.aiCardSearchBtn}>
                        <FontAwesome name="search" size={10} color={Colors.primary} />
                        <Text style={styles.aiCardSearchText}>Find trips</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {!aiLoading && aiSuggestions.length === 0 && (
                    <View style={styles.aiEmpty}>
                      <Text style={styles.aiEmptyText}>Complete your profile to get personalized picks.</Text>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Trending destinations */}
              {trendingDests.length > 0 && (
                <>
                  <View style={styles.sectionRow}>
                    <FontAwesome name="fire" size={12} color="#E85438" />
                    <Text style={styles.sectionTitle}>Trending</Text>
                  </View>
                  <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.trendScroll}
                  >
                    {trendingDests.map(d => (
                      <TouchableOpacity
                        key={d.destination}
                        style={styles.trendChip}
                        onPress={() => setSearch(d.destination)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.trendChipName}>{d.destination}</Text>
                        <View style={styles.trendChipBadge}>
                          <Text style={styles.trendChipCount}>{d.count}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Weekend from user's city */}
              <View style={styles.sectionRow}>
                <FontAwesome name="plane" size={12} color={Colors.textSecondary} />
                <Text style={styles.sectionTitle}>Weekend from {userCity}</Text>
              </View>
              {weekendLoading ? (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.aiLoadingText}>Finding trips near you...</Text>
                </View>
              ) : (
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weekendScroll}
              >
                {weekendPicks.map(d => {
                  const color = VIBE_COLOR[d.vibe] ?? Colors.primary;
                  const photoUrl = `https://source.unsplash.com/400x220/?${encodeURIComponent(d.destination)},travel,city`;
                  const tripCount = trendingDests.find(t =>
                    t.destination.toLowerCase().includes(d.destination.toLowerCase())
                  )?.count ?? 0;
                  return (
                    <WeekendCard
                      key={d.destination}
                      dest={d}
                      color={color}
                      photoUrl={photoUrl}
                      tripCount={tripCount}
                      onPress={() => setSearch(d.destination)}
                    />
                  );
                })}
              </ScrollView>
              )}


              {/* Public trips header */}
              <View style={styles.sectionRow}>
                <FontAwesome name="globe" size={12} color={Colors.textSecondary} />
                <Text style={styles.sectionTitle}>Public trips</Text>
                {publicTrips.length > 0 && (
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{publicTrips.length}</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.resultLabel}>
              {filtered.length} {filtered.length === 1 ? 'trip' : 'trips'} matching "{search}"
            </Text>
          )
        }
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <FontAwesome name={search ? 'search' : 'globe'} size={22} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{search ? 'No trips found' : 'No public trips yet'}</Text>
            <Text style={styles.emptySub}>
              {search
                ? 'Try a different destination or clear the search.'
                : 'Be the first! Open any trip → Edit → toggle "Visible on Discover".'}
            </Text>
          </View>
        ) : <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />}
        renderItem={({ item }) => <PublicTripCard trip={item} />}
      />
    </SafeAreaView>
  );
}

function WeekendCard({ dest, color, photoUrl, tripCount, onPress }: {
  dest: WeekendDest; color: string; photoUrl: string; tripCount: number; onPress: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <TouchableOpacity style={styles.weekendCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.weekendImageWrap}>
        {!photoFailed ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.weekendImage}
            resizeMode="cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <View style={[styles.weekendImage, { backgroundColor: color + '33' }]} />
        )}
        <View style={styles.weekendImageOverlay} />
        <View style={[styles.weekendVibePill, { backgroundColor: color }]}>
          <FontAwesome name={(VIBE_ICON[dest.vibe] ?? 'map-marker') as any} size={9} color="#fff" />
        </View>
        {tripCount > 0 && (
          <View style={styles.weekendTripBadge}>
            <Text style={styles.weekendTripBadgeText}>{tripCount} trip{tripCount !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
      <View style={styles.weekendBody}>
        <Text style={styles.weekendCity}>{dest.destination}</Text>
        <Text style={styles.weekendCountry}>{dest.country}</Text>
        <View style={styles.weekendMeta}>
          <FontAwesome name="clock-o" size={9} color={Colors.textMuted} />
          <Text style={styles.weekendMetaText}>{dest.flightHours}</Text>
        </View>
        <Text style={[styles.weekendBudget, { color }]}>~€{dest.budgetPerDay}/day</Text>
      </View>
    </TouchableOpacity>
  );
}

function PublicTripCard({ trip }: { trip: PublicTrip }) {
  const dateLabel = formatDateRange(trip.stops);
  const fresh = isRecent(trip.created_at);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/public-trip/${trip.id}`)}
      activeOpacity={0.8}
    >
      {trip.cover_image ? (
        <View>
          <Image source={{ uri: trip.cover_image }} style={styles.cardCover} resizeMode="cover" />
          <View style={styles.cardCoverOverlay} />
          {fresh && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
          <Text style={styles.cardTitleOnCover} numberOfLines={1}>{trip.name}</Text>
        </View>
      ) : (
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>{trip.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {fresh && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
            <FontAwesome name="angle-right" size={16} color={Colors.textMuted} />
          </View>
        </View>
      )}
      <View style={styles.cardBody}>
        {trip.stops.length > 0 && (
          <Text style={styles.cardDests} numberOfLines={1}>
            {trip.stops.map(s => s.destination).join(' → ')}
          </Text>
        )}
        <View style={styles.cardMetaRow}>
          {dateLabel ? (
            <View style={styles.metaPill}>
              <FontAwesome name="calendar-o" size={10} color={Colors.textMuted} />
              <Text style={styles.metaText}>{dateLabel}</Text>
            </View>
          ) : null}
          <View style={styles.metaPill}>
            <FontAwesome name="users" size={10} color={Colors.textMuted} />
            <Text style={styles.metaText}>{trip.member_count} {trip.member_count === 1 ? 'traveler' : 'travelers'}</Text>
          </View>
          <View style={[styles.metaPill, styles.metaPillAccent]}>
            <Text style={styles.metaTextAccent}>View trip</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.text, letterSpacing: -0.8 },
  headerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: Colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  list: { paddingHorizontal: 16, paddingBottom: 40 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  sectionBadge: {
    backgroundColor: Colors.backgroundAlt, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  sectionBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  resultLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },

  // AI section
  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, paddingLeft: 4 },
  aiLoadingText: { fontSize: 13, color: Colors.textSecondary },
  aiScroll: { paddingBottom: 20, gap: 10 },
  aiCard: {
    width: 160, backgroundColor: Colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 6,
  },
  aiCardIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  aiCardDest: { fontSize: 13, fontWeight: '700', color: Colors.text, letterSpacing: -0.2 },
  aiCardTagline: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, flex: 1 },
  aiCardBudget: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  aiCardSearchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 4, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  aiCardSearchText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  aiEmpty: {
    width: 200, backgroundColor: Colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 16, justifyContent: 'center',
  },
  aiEmptyText: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

  // Trending
  trendScroll: { gap: 8, paddingBottom: 20 },
  trendChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  trendChipName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  trendChipBadge: {
    backgroundColor: Colors.primaryDim, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  trendChipCount: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  // Weekend from Madrid
  weekendScroll: { gap: 10, paddingBottom: 20 },
  weekendCard: {
    width: 145, backgroundColor: Colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  weekendImageWrap: { width: '100%', height: 100, position: 'relative' },
  weekendImage: { width: '100%', height: 100 },
  weekendImageOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  weekendVibePill: {
    position: 'absolute', top: 8, left: 8,
    width: 22, height: 22, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  weekendTripBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  weekendTripBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  weekendBody: { padding: 10, gap: 2 },
  weekendCity: { fontSize: 13, fontWeight: '700', color: Colors.text, letterSpacing: -0.3 },
  weekendCountry: { fontSize: 10, color: Colors.textMuted },
  weekendMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  weekendMetaText: { fontSize: 10, color: Colors.textMuted },
  weekendBudget: { fontSize: 11, fontWeight: '700', marginTop: 1 },

  // Trip cards
  card: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 10, overflow: 'hidden',
  },
  cardCover: { width: '100%', height: 120 },
  cardCoverOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 120,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  cardTitleOnCover: {
    position: 'absolute', bottom: 10, left: 14, right: 14,
    fontSize: 16, fontWeight: '700', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, paddingBottom: 0,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },
  cardBody: { padding: 14, paddingTop: 8, gap: 8 },
  cardDests: { fontSize: 13, color: Colors.textSecondary },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.backgroundAlt, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  metaPillAccent: { backgroundColor: Colors.primaryDim, marginLeft: 'auto' as any },
  metaText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  metaTextAccent: { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  newBadge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: Colors.primary, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  newBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 12 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
