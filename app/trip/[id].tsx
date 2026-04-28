import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  FlatList, TextInput, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl, Share, Animated, Alert, Image, Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { Trip, TripStop, TripTab, Idea, TripMember, Flight, IdeaComment, TripExpense, PackingItem, ItineraryItem, ItineraryCategory, TransportType } from '@/lib/types';
import { createNotificationsForTrip } from '@/lib/notifications';
import CalendarPicker from '@/components/CalendarPicker';
import CitySearchInput from '@/components/CitySearchInput';
import AirportSearchInput from '@/components/AirportSearchInput';
import AirlineSearchInput from '@/components/AirlineSearchInput';

// ─── Tab icon map (FontAwesome, no emojis) ────────────────────────────────────
const TAB_FA: Record<string, string> = {
  Flights: 'plane',
  Accommodation: 'home',
  Restaurants: 'cutlery',
  Activities: 'star-o',
  Nightlife: 'glass',
  Transport: 'car',
  Budget: 'money',
  Packing: 'suitcase',
  Documents: 'file-text-o',
};
function tabIcon(name: string): string {
  return TAB_FA[name] ?? 'bookmark-o';
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const SPLITS_TAB_ID = '__splits__';
const splitsTab: TripTab = {
  id: SPLITS_TAB_ID, trip_id: '', name: 'Splits',
  icon: 'code-fork', order_index: 9999, created_by: null,
};

const MAP_TAB_ID = '__map__';
const mapTab: TripTab = {
  id: MAP_TAB_ID, trip_id: '', name: 'Map',
  icon: 'map-marker', order_index: 9998, created_by: null,
};

const ITINERARY_TAB_ID = '__itinerary__';
const itineraryTab: TripTab = {
  id: ITINERARY_TAB_ID, trip_id: '', name: 'Itinerary',
  icon: 'calendar', order_index: 9997, created_by: null,
};

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [tabs, setTabs] = useState<TripTab[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [subTrips, setSubTrips] = useState<Trip[]>([]);
  const [parentTrip, setParentTrip] = useState<Trip | null>(null);
  const [activeTab, setActiveTab] = useState<TripTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadTrip() {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    const [tripRes, stopsRes, tabsRes, membersRes, subTripsRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', id).single(),
      supabase.from('trip_stops').select('*').eq('trip_id', id).order('order_index'),
      supabase.from('trip_tabs').select('*').eq('trip_id', id).order('order_index'),
      supabase.from('trip_members').select('*').eq('trip_id', id),
      supabase.from('trips').select('*').eq('parent_trip_id', id).order('created_at'),
    ]);
    const loadedTrip = tripRes.data as Trip | null;
    setTrip(loadedTrip);
    setStops(stopsRes.data ?? []);
    setTabs(tabsRes.data ?? []);
    setMembers(membersRes.data ?? []);
    setSubTrips(subTripsRes.data ?? []);

    // Load parent trip if this is a sub-trip
    if (loadedTrip?.parent_trip_id) {
      const { data: parent } = await supabase
        .from('trips').select('*').eq('id', loadedTrip.parent_trip_id).single();
      setParentTrip(parent);
    } else {
      setParentTrip(null);
    }

    if (!activeTab && tabsRes.data?.length) setActiveTab(tabsRes.data[0]);
    setLoading(false);
  }

  useEffect(() => { loadTrip(); }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrip();
    setRefreshing(false);
  }, [id]);

  async function confirmDelete() {
    setDeleting(true);
    await supabase.from('trips').delete().eq('id', id);
    setDeleting(false);
    setShowDeleteConfirm(false);
    router.replace('/(tabs)');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: Colors.textSecondary, padding: 24 }}>Trip not found.</Text>
      </SafeAreaView>
    );
  }

  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const daysUntil = firstStop?.start_date
    ? Math.ceil((new Date(firstStop.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Sub-trips get plain tabs. Root trips get the Itinerary, Map and Splits tabs appended at the end.
  const allTabs = trip.parent_trip_id
    ? tabs
    : [...tabs,
        { ...itineraryTab, trip_id: id as string },
        { ...mapTab, trip_id: id as string },
        { ...splitsTab, trip_id: id as string }];

  return (
    <SafeAreaView style={styles.container}>
      {/* Parent trip breadcrumb (only on sub-trips) */}
      {parentTrip && (
        <TouchableOpacity
          style={styles.parentCrumb}
          onPress={() => router.replace(`/trip/${parentTrip.id}`)}
          activeOpacity={0.7}
        >
          <FontAwesome name="angle-left" size={12} color={Colors.primary} />
          <FontAwesome name="code-fork" size={11} color={Colors.primary} />
          <Text style={styles.parentCrumbText}>
            Split from <Text style={styles.parentCrumbName}>{parentTrip.name}</Text>
          </Text>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="angle-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
          {stops.length > 0 && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {stops.map(s => s.destination).join(' · ')}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {!trip.parent_trip_id && (
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowInvite(true)}>
              <FontAwesome name="user-plus" size={15} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowMenu(true)}>
            <FontAwesome name="ellipsis-v" size={16} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Trip menu */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowMenu(false); setShowEdit(true); }}
              activeOpacity={0.7}
            >
              <FontAwesome name="pencil" size={15} color={Colors.text} />
              <Text style={styles.menuItemText}>Edit trip</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
              activeOpacity={0.7}
            >
              <FontAwesome name="trash-o" size={15} color="#E53E3E" />
              <Text style={[styles.menuItemText, { color: '#E53E3E' }]}>Delete trip</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cover image */}
      {trip.cover_image ? (
        <View>
          <Image
            source={{ uri: trip.cover_image }}
            style={{ width: '100%', height: 100 }}
            resizeMode="cover"
          />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' }} />
        </View>
      ) : null}

      {/* Trip stats bar */}
      <View style={styles.statsBar}>
        <StatPill
          icon="users"
          label={trip.people_count
            ? `${members.length}/${trip.people_count}`
            : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}
        />
        {firstStop?.start_date && (
          <StatPill icon="calendar" label={formatDateRange(firstStop, lastStop)} />
        )}
        {daysUntil !== null && daysUntil > 0 && (
          <StatPill
            icon="clock-o"
            label={`${daysUntil}d away`}
            urgent={daysUntil <= 7}
          />
        )}
        <StatPill
          icon="circle"
          label={trip.status}
          color={trip.status === 'confirmed' ? Colors.green : Colors.primary}
        />
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBarContent}
      >
        {allTabs.map(tab => {
          const isSplits = tab.id === SPLITS_TAB_ID;
          const isMap = tab.id === MAP_TAB_ID;
          const isItinerary = tab.id === ITINERARY_TAB_ID;
          const isVirtual = isSplits || isMap || isItinerary;
          const isActive = activeTab?.id === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tabBtn,
                isActive ? styles.tabBtnActive : styles.tabBtnInactive,
                isSplits && styles.tabBtnSplits,
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <FontAwesome
                name={(isVirtual ? tab.icon : tabIcon(tab.name)) as any}
                size={14}
                color={isActive ? (isSplits ? Colors.primary : Colors.text) : Colors.textMuted}
              />
              {isActive && (
                <Text style={[
                  styles.tabLabel,
                  styles.tabLabelActive,
                  isSplits && styles.tabLabelSplitsActive,
                ]}>
                  {tab.name}
                  {isSplits && subTrips.length > 0 ? ` (${subTrips.length})` : ''}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tab content */}
      {activeTab && (
        activeTab.id === ITINERARY_TAB_ID ? (
          <ItineraryTab
            tripId={id as string}
            stops={stops}
            userId={userId}
            members={members}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        ) : activeTab.id === MAP_TAB_ID ? (
          <MapTab
            tripId={id as string}
            stops={stops}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        ) : activeTab.id === SPLITS_TAB_ID ? (
          <SplitsTab
            tripId={id as string}
            tripName={trip.name}
            subTrips={subTrips}
            members={members}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onCreated={loadTrip}
          />
        ) : (
          <TabContent
            tab={activeTab}
            tripId={id}
            tripName={trip.name}
            stops={stops}
            userId={userId}
            members={members}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        )
      )}

      {/* Delete confirmation */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>Delete trip</Text>
            <Text style={styles.confirmBody}>
              Are you sure you want to delete <Text style={{ fontWeight: '700' }}>{trip.name}</Text>? This will remove all ideas, flights and data. This cannot be undone.
            </Text>
            <TouchableOpacity
              style={styles.confirmDeleteBtn}
              onPress={confirmDelete}
              disabled={deleting}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmDeleteText}>{deleting ? 'Deleting...' : 'Yes, delete'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmCancelBtn}
              onPress={() => setShowDeleteConfirm(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit modal */}
      <EditTripModal
        visible={showEdit}
        trip={trip}
        initialStops={stops}
        currentMembers={members}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => { setTrip(updated); setShowEdit(false); loadTrip(); }}
      />

      {/* Invite modal */}
      <InviteModal
        visible={showInvite}
        trip={trip}
        onClose={() => setShowInvite(false)}
      />
    </SafeAreaView>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ icon, label, urgent, color }: {
  icon: string; label: string; urgent?: boolean; color?: string;
}) {
  return (
    <View style={[styles.statPill, urgent && styles.statPillUrgent]}>
      <FontAwesome
        name={icon as any}
        size={11}
        color={urgent ? Colors.primary : (color ?? Colors.textMuted)}
      />
      <Text style={[styles.statPillText, urgent && styles.statPillTextUrgent, color ? { color } : {}]}>
        {label}
      </Text>
    </View>
  );
}

// ─── Splits Tab ───────────────────────────────────────────────────────────────

function SplitsTab({ tripId, tripName, subTrips, members, refreshing, onRefresh, onCreated }: {
  tripId: string; tripName: string; subTrips: Trip[];
  members: TripMember[]; refreshing: boolean;
  onRefresh: () => void; onCreated: () => void;
}) {
  function getMemberNames(trip: Trip): string {
    // We don't have per-sub-trip members loaded here, just show people_count
    if (trip.people_count) return `${trip.people_count} people`;
    return '';
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.splitsList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {subTrips.length === 0 ? (
          <View style={styles.splitsEmpty}>
            <View style={styles.splitsEmptyIcon}>
              <FontAwesome name="code-fork" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.splitsEmptyTitle}>No splits yet</Text>
            <Text style={styles.splitsEmptySub}>
              When part of the group wants to do something different, create a split — a parallel plan with its own workspace.
            </Text>
          </View>
        ) : (
          subTrips.map(st => (
            <TouchableOpacity
              key={st.id}
              style={styles.splitCard}
              onPress={() => router.push(`/trip/${st.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.splitCardLeft}>
                <View style={styles.splitForkIcon}>
                  <FontAwesome name="code-fork" size={13} color={Colors.primary} />
                </View>
                <View style={styles.splitCardInfo}>
                  <Text style={styles.splitCardName}>{st.name}</Text>
                  {st.split_note ? (
                    <Text style={styles.splitCardNote} numberOfLines={1}>{st.split_note}</Text>
                  ) : null}
                  <View style={styles.splitCardMeta}>
                    {st.people_count ? (
                      <View style={styles.splitMetaPill}>
                        <FontAwesome name="users" size={10} color={Colors.textMuted} />
                        <Text style={styles.splitMetaText}>{st.people_count} people</Text>
                      </View>
                    ) : null}
                    <View style={[styles.splitMetaPill, { backgroundColor: st.status === 'confirmed' ? Colors.greenDim : Colors.primaryDim }]}>
                      <Text style={[styles.splitMetaText, { color: st.status === 'confirmed' ? Colors.green : Colors.primary }]}>
                        {st.status === 'confirmed' ? 'Confirmed' : 'Planning'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <FontAwesome name="angle-right" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Create split FAB */}
      <TouchableOpacity
        style={styles.splitFab}
        onPress={() => router.push({ pathname: '/create-split', params: { parentId: tripId, parentName: tripName } })}
        activeOpacity={0.85}
      >
        <FontAwesome name="code-fork" size={14} color={Colors.white} />
        <Text style={styles.splitFabText}>Create a split</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Map Tab ──────────────────────────────────────────────────────────────────

function MapTab({ tripId, stops, refreshing, onRefresh }: {
  tripId: string; stops: TripStop[];
  refreshing: boolean; onRefresh: () => void;
}) {
  const [locations, setLocations] = useState<{ name: string; lat: number; lng: number; type: string }[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => { geocodeAll(); }, [stops, tripId]);

  async function geocodeAll() {
    setGeocoding(true);
    const results: { name: string; lat: number; lng: number; type: string }[] = [];

    // Geocode stops
    for (const stop of stops) {
      if (!stop.destination) continue;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(stop.destination)}&format=json&limit=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        if (data[0]) {
          results.push({
            name: stop.destination,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            type: 'stop',
          });
        }
      } catch {}
    }

    // Geocode confirmed ideas from Accommodation and Restaurants tabs
    try {
      const { data: ideas } = await supabase
        .from('ideas')
        .select('title, status')
        .eq('trip_id', tripId);

      if (ideas?.length && stops[0]?.destination) {
        const city = stops[0].destination.split(',')[0].trim();
        for (const idea of ideas.slice(0, 10)) {
          try {
            const q = `${idea.title}, ${city}`;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
              { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            if (data[0] && parseFloat(data[0].importance) > 0.15) {
              results.push({
                name: idea.title,
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                type: idea.status === 'confirmed' ? 'confirmed' : 'idea',
              });
            }
          } catch {}
          await new Promise(r => setTimeout(r, 1100));
        }
      }
    } catch {}

    setLocations(results);
    setGeocoding(false);
  }

  const mapHtml = generateMapHtml(locations);

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, minHeight: 320 }}>
        {geocoding && locations.length === 0 && (
          <View style={styles.mapLoadingBar}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.mapLoadingText}>Locating places...</Text>
          </View>
        )}
        <iframe
          srcDoc={mapHtml}
          style={{ border: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' } as any}
          title="Trip map"
          sandbox="allow-scripts allow-same-origin"
        />
      </View>
    );
  }

  // Native fallback — stop list with Google Maps links
  return (
    <ScrollView
      contentContainerStyle={styles.mapFallback}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.mapFallbackIcon}>
        <FontAwesome name="map-marker" size={28} color={Colors.primary} />
      </View>
      <Text style={styles.mapFallbackTitle}>Trip map</Text>
      <Text style={styles.mapFallbackSub}>Tap a destination to open in Google Maps.</Text>
      {stops.map(s => (
        <TouchableOpacity
          key={s.id}
          style={styles.mapStopRow}
          onPress={() => Linking.openURL(`https://www.google.com/maps/search/${encodeURIComponent(s.destination)}`)}
          activeOpacity={0.7}
        >
          <FontAwesome name="map-marker" size={14} color={Colors.primary} />
          <Text style={styles.mapStopText}>{s.destination}</Text>
          <FontAwesome name="external-link" size={12} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function generateMapHtml(locations: { name: string; lat: number; lng: number; type: string }[]): string {
  const markersJson = JSON.stringify(locations);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #f2ede8; }
    #map { width: 100%; height: 100%; }
    .leaflet-popup-content-wrapper {
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      border: none;
    }
    .leaflet-popup-content { margin: 10px 14px; }
    .stop-label {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px; font-weight: 700; color: #1A1814;
    }
    .idea-label {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px; font-weight: 500; color: #4a4540;
    }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: true });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    var markers = ${markersJson};

    function makeStopIcon(label) {
      var html = '<div style="'
        + 'background:#E8622A;'
        + 'color:#fff;'
        + 'font-family:-apple-system,sans-serif;'
        + 'font-size:11px;font-weight:700;'
        + 'padding:5px 10px;'
        + 'border-radius:20px;'
        + 'white-space:nowrap;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,0.25);'
        + 'border:2px solid #fff;'
        + '">' + label + '</div>';
      return L.divIcon({ html: html, className: '', iconAnchor: [0, 0] });
    }

    function makeIdeaIcon(confirmed) {
      var color = confirmed ? '#00A878' : '#3D7EFF';
      var html = '<div style="'
        + 'background:' + color + ';'
        + 'width:11px;height:11px;border-radius:50%;'
        + 'border:2.5px solid #fff;'
        + 'box-shadow:0 1px 5px rgba(0,0,0,0.3);'
        + '"></div>';
      return L.divIcon({ html: html, className: '', iconSize: [11,11], iconAnchor: [5,5] });
    }

    var stops = markers.filter(function(m) { return m.type === 'stop'; });
    var ideas = markers.filter(function(m) { return m.type !== 'stop'; });

    // Draw route polyline between stops
    if (stops.length > 1) {
      L.polyline(stops.map(function(s) { return [s.lat, s.lng]; }), {
        color: '#E8622A', weight: 2.5, opacity: 0.6, dashArray: '6, 8'
      }).addTo(map);
    }

    if (markers.length === 0) {
      map.setView([20, 10], 2);
    } else {
      stops.forEach(function(m) {
        L.marker([m.lat, m.lng], { icon: makeStopIcon(m.name) })
          .addTo(map)
          .bindPopup('<div class="stop-label">' + m.name + '</div>');
      });
      ideas.forEach(function(m) {
        var confirmed = m.type === 'confirmed';
        L.marker([m.lat, m.lng], { icon: makeIdeaIcon(confirmed) })
          .addTo(map)
          .bindPopup('<div class="idea-label">' + (confirmed ? '✓ ' : '') + m.name + '</div>');
      });
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 12);
      } else {
        var bounds = L.latLngBounds(markers.map(function(m) { return [m.lat, m.lng]; }));
        map.fitBounds(bounds, { padding: [48, 48] });
      }
    }
  </script>
</body>
</html>`;
}

// ─── Itinerary Tab ────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { icon: string; color: string; label: string }> = {
  transport:     { icon: 'car',        color: '#3D7EFF', label: 'Transport' },
  accommodation: { icon: 'home',       color: '#9B59B6', label: 'Accommodation' },
  food:          { icon: 'cutlery',    color: '#E8622A', label: 'Food & Drink' },
  activity:      { icon: 'star',       color: '#00A878', label: 'Activity' },
  nightlife:     { icon: 'glass',      color: '#E91E8C', label: 'Nightlife' },
  other:         { icon: 'circle-o',   color: '#B0ABA4', label: 'Other' },
};

function getDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(start + 'T12:00:00');
  const last = new Date(end + 'T12:00:00');
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatDayHeader(dateStr: string): { dayName: string; dayNum: string; monthAbbr: string } {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    dayName: d.toLocaleDateString('en', { weekday: 'short' }),
    dayNum: String(d.getDate()),
    monthAbbr: d.toLocaleDateString('en', { month: 'short' }),
  };
}

function ItineraryTab({ tripId, stops, userId, members, refreshing, onRefresh }: {
  tripId: string; stops: TripStop[]; userId: string | null;
  members: TripMember[]; refreshing: boolean; onRefresh: () => void;
}) {
  // Compute days from trip stops date range
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const startDate = firstStop?.start_date;
  const endDate = (lastStop?.end_date ?? lastStop?.start_date) ?? startDate;
  const days = startDate && endDate ? getDaysBetween(startDate, endDate) : [];

  const [selectedDay, setSelectedDay] = useState<string>(days[0] ?? '');
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const dayScrollRef = useRef<any>(null);

  useEffect(() => {
    if (days[0] && !selectedDay) setSelectedDay(days[0]);
  }, [days.join(',')]);

  useEffect(() => {
    if (selectedDay) loadItems();
  }, [selectedDay]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`itinerary-${tripId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'itinerary_items',
        filter: `trip_id=eq.${tripId}`,
      }, loadItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  async function loadItems() {
    if (!selectedDay) return;
    setLoadingItems(true);
    const { data } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('trip_id', tripId)
      .eq('date', selectedDay)
      .order('time_start', { nullsFirst: false })
      .order('order_index');
    setItems(data ?? []);
    setLoadingItems(false);
  }

  async function deleteItem(id: string) {
    await supabase.from('itinerary_items').delete().eq('id', id);
    loadItems();
  }

  if (days.length === 0) {
    return (
      <View style={styles.itineraryEmpty}>
        <View style={styles.itineraryEmptyIcon}>
          <FontAwesome name="calendar" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.itineraryEmptyTitle}>No dates set</Text>
        <Text style={styles.itineraryEmptySub}>
          Add dates to your trip stops to unlock the daily itinerary planner.
        </Text>
      </View>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  // Find which stop this day belongs to
  const currentStop = stops.find(s =>
    s.start_date && s.end_date
      ? selectedDay >= s.start_date && selectedDay <= s.end_date
      : s.start_date === selectedDay
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Day selector */}
      <ScrollView
        ref={dayScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.daySelectorScroll}
        contentContainerStyle={styles.daySelectorContent}
      >
        {days.map(day => {
          const { dayName, dayNum, monthAbbr } = formatDayHeader(day);
          const isSelected = day === selectedDay;
          const isToday = day === today;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayChip, isSelected && styles.dayChipSelected]}
              onPress={() => setSelectedDay(day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayChipName, isSelected && styles.dayChipNameSelected]}>
                {dayName}
              </Text>
              <Text style={[styles.dayChipNum, isSelected && styles.dayChipNumSelected]}>
                {dayNum}
              </Text>
              <Text style={[styles.dayChipMonth, isSelected && styles.dayChipMonthSelected]}>
                {monthAbbr}
              </Text>
              {isToday && <View style={[styles.dayChipTodayDot, isSelected && styles.dayChipTodayDotSelected]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Destination label for this day */}
      {currentStop && (
        <View style={styles.dayDestRow}>
          <FontAwesome name="map-marker" size={11} color={Colors.primary} />
          <Text style={styles.dayDestText}>{currentStop.destination}</Text>
        </View>
      )}

      {/* Items list */}
      <ScrollView
        contentContainerStyle={styles.itineraryList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loadingItems ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.dayEmpty}>
            <Text style={styles.dayEmptyTitle}>Nothing planned yet</Text>
            <Text style={styles.dayEmptyText}>Add activities, meals, and transport for this day.</Text>
            <TouchableOpacity style={styles.dayImportBtn} onPress={() => setShowImport(true)} activeOpacity={0.8}>
              <FontAwesome name="magic" size={13} color={Colors.primary} />
              <Text style={styles.dayImportBtnText}>Add from confirmed ideas</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {items.map((item, index) => {
              const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other;
              return (
                <View key={item.id} style={styles.itineraryRow}>
                  {/* Time column */}
                  <View style={styles.itineraryTimeCol}>
                    {item.time_start ? (
                      <Text style={styles.itineraryTime}>{item.time_start}</Text>
                    ) : (
                      <Text style={styles.itineraryTimeEmpty}>—</Text>
                    )}
                    {index < items.length - 1 && <View style={styles.itineraryConnector} />}
                  </View>
                  {/* Content */}
                  <View style={[styles.itineraryCard, { borderLeftColor: meta.color }]}>
                    <View style={styles.itineraryCardTop}>
                      <View style={[styles.itineraryCatIcon, { backgroundColor: meta.color + '18' }]}>
                        <FontAwesome name={meta.icon as any} size={12} color={meta.color} />
                      </View>
                      <Text style={styles.itineraryCardTitle} numberOfLines={2}>{item.title}</Text>
                      <TouchableOpacity onPress={() => deleteItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <FontAwesome name="times" size={12} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                    {item.description ? (
                      <Text style={styles.itineraryCardDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <Text style={styles.itineraryCatLabel}>{meta.label}</Text>
                  </View>
                </View>
              );
            })}
            <TouchableOpacity style={styles.dayImportBtn} onPress={() => setShowImport(true)} activeOpacity={0.8}>
              <FontAwesome name="magic" size={13} color={Colors.primary} />
              <Text style={styles.dayImportBtnText}>Add from confirmed ideas</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>+ Add to day</Text>
      </TouchableOpacity>

      {/* Add item modal */}
      <AddItineraryItemModal
        visible={showAdd}
        tripId={tripId}
        date={selectedDay}
        userId={userId}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); loadItems(); }}
      />

      {/* Import from ideas modal */}
      <ImportIdeasModal
        visible={showImport}
        tripId={tripId}
        date={selectedDay}
        userId={userId}
        onClose={() => setShowImport(false)}
        onImported={() => { setShowImport(false); loadItems(); }}
      />
    </View>
  );
}

// ─── Add Itinerary Item Modal ─────────────────────────────────────────────────

function AddItineraryItemModal({ visible, tripId, date, userId, onClose, onAdded }: {
  visible: boolean; tripId: string; date: string;
  userId: string | null; onClose: () => void; onAdded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [category, setCategory] = useState<ItineraryCategory>('activity');
  const [saving, setSaving] = useState(false);

  const CATS = Object.entries(CATEGORY_META) as [ItineraryCategory, typeof CATEGORY_META[string]][];

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const timeVal = timeStart.match(/^\d{1,2}:\d{2}$/) ? timeStart : null;
    await supabase.from('itinerary_items').insert({
      trip_id: tripId,
      date,
      title: title.trim(),
      description: description.trim() || null,
      time_start: timeVal,
      category,
      created_by: userId,
      order_index: 0,
    });
    setSaving(false);
    setTitle(''); setDescription(''); setTimeStart(''); setCategory('activity');
    onAdded();
  }

  const d = new Date(date + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add to {dateLabel}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || !title.trim()}>
            <Text style={[styles.modalAction, (saving || !title.trim()) && { opacity: 0.4 }]}>
              {saving ? 'Saving...' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.editLabel}>Activity</Text>
          <TextInput
            style={[styles.modalInput, styles.modalInputLarge]}
            placeholder="e.g. Lunch at Boqueria Market"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            autoFocus
          />

          <Text style={styles.editLabel}>Category</Text>
          <View style={styles.catGrid}>
            {CATS.map(([key, meta]) => (
              <TouchableOpacity
                key={key}
                style={[styles.catChip, category === key && { borderColor: meta.color, backgroundColor: meta.color + '18' }]}
                onPress={() => setCategory(key)}
                activeOpacity={0.7}
              >
                <FontAwesome name={meta.icon as any} size={13} color={category === key ? meta.color : Colors.textMuted} />
                <Text style={[styles.catChipText, category === key && { color: meta.color, fontWeight: '700' }]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.editLabel}>Time <Text style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: Colors.textMuted }}>(optional)</Text></Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. 09:30"
            placeholderTextColor={Colors.textMuted}
            value={timeStart}
            onChangeText={setTimeStart}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />

          <Text style={styles.editLabel}>Notes <Text style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: Colors.textMuted }}>(optional)</Text></Text>
          <TextInput
            style={[styles.modalInput, styles.modalInputMulti]}
            placeholder="Any details, address, booking info..."
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Import Ideas Modal ───────────────────────────────────────────────────────

function ImportIdeasModal({ visible, tripId, date, userId, onClose, onImported }: {
  visible: boolean; tripId: string; date: string;
  userId: string | null; onClose: () => void; onImported: () => void;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (visible) { setSelected(new Set()); loadIdeas(); }
  }, [visible]);

  async function loadIdeas() {
    setLoading(true);
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .eq('trip_id', tripId)
      .eq('status', 'confirmed')
      .order('created_at');
    setIdeas(data ?? []);
    setLoading(false);
  }

  async function handleImport() {
    if (!selected.size) return;
    setImporting(true);
    const toImport = ideas.filter(i => selected.has(i.id));
    await supabase.from('itinerary_items').insert(
      toImport.map((idea, idx) => ({
        trip_id: tripId,
        date,
        title: idea.title,
        description: idea.description ?? null,
        time_start: null,
        category: guessCategory(idea),
        idea_id: idea.id,
        created_by: userId,
        order_index: idx,
      }))
    );
    setImporting(false);
    onImported();
  }

  function guessCategory(idea: Idea): ItineraryCategory {
    const title = idea.title.toLowerCase();
    if (title.match(/hotel|hostel|airbnb|accommodation|stay/)) return 'accommodation';
    if (title.match(/restaurant|cafe|bar|lunch|dinner|breakfast|food|eat/)) return 'food';
    if (title.match(/flight|train|bus|taxi|transport|transfer/)) return 'transport';
    if (title.match(/club|party|nightlife|disco|bar/)) return 'nightlife';
    return 'activity';
  }

  const d = new Date(date + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add to {dateLabel}</Text>
          <TouchableOpacity onPress={handleImport} disabled={importing || !selected.size}>
            <Text style={[styles.modalAction, (!selected.size || importing) && { opacity: 0.4 }]}>
              {importing ? 'Adding...' : `Add (${selected.size})`}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 13, color: Colors.textSecondary, paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 }}>
          Select confirmed ideas to add to this day.
        </Text>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : ideas.length === 0 ? (
          <View style={styles.emptyTab}>
            <Text style={styles.emptyTabTitle}>No confirmed ideas yet</Text>
            <Text style={styles.emptyTabSub}>Confirm some ideas in your tabs first, then import them into the itinerary.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            {ideas.map(idea => {
              const isSelected = selected.has(idea.id);
              return (
                <TouchableOpacity
                  key={idea.id}
                  style={[styles.importIdeaRow, isSelected && styles.importIdeaRowSelected]}
                  onPress={() => setSelected(prev => {
                    const next = new Set(prev);
                    if (next.has(idea.id)) next.delete(idea.id);
                    else next.add(idea.id);
                    return next;
                  })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.importIdeaCheck, isSelected && styles.importIdeaCheckSelected]}>
                    {isSelected && <FontAwesome name="check" size={11} color={Colors.white} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.importIdeaTitle}>{idea.title}</Text>
                    {idea.description ? (
                      <Text style={styles.importIdeaDesc} numberOfLines={1}>{idea.description}</Text>
                    ) : null}
                  </View>
                  {idea.estimated_cost != null && (
                    <Text style={styles.importIdeaCost}>{idea.currency}{idea.estimated_cost}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Tab Content ──────────────────────────────────────────────────────────────

function TabContent({ tab, tripId, tripName, stops, userId, members, refreshing, onRefresh }: {
  tab: TripTab; tripId: string; tripName: string; stops: TripStop[];
  userId: string | null; members: TripMember[]; refreshing: boolean; onRefresh: () => void;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showAI, setShowAI] = useState(false);

  async function loadIdeas() {
    const { data } = await supabase
      .from('ideas').select('*').eq('tab_id', tab.id)
      .order('status').order('vote_count', { ascending: false });
    setIdeas(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadIdeas(); }, [tab.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`ideas-tab-${tab.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas', filter: `tab_id=eq.${tab.id}` },
        () => loadIdeas()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'idea_votes' },
        () => loadIdeas()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab.id]);

  async function handleVote(idea: Idea) {
    if (!userId) return;
    const { data: existing } = await supabase
      .from('idea_votes').select('id').eq('idea_id', idea.id).eq('user_id', userId).single();
    if (existing) {
      await supabase.from('idea_votes').delete().eq('id', existing.id);
      await supabase.from('ideas').update({ vote_count: Math.max(0, idea.vote_count - 1) }).eq('id', idea.id);
    } else {
      await supabase.from('idea_votes').insert({ idea_id: idea.id, user_id: userId });
      await supabase.from('ideas').update({ vote_count: idea.vote_count + 1 }).eq('id', idea.id);
    }
    loadIdeas();
  }

  async function handleConfirm(idea: Idea, tripName: string) {
    await supabase.from('ideas').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', idea.id);
    if (userId) {
      await createNotificationsForTrip(tripId, userId, 'idea_confirmed', `"${idea.title}" was confirmed ✓`, tripName);
    }
    loadIdeas();
  }

  async function handleUnconfirm(idea: Idea) {
    await supabase.from('ideas').update({ status: 'idea', confirmed_at: null }).eq('id', idea.id);
    loadIdeas();
  }

  if (tab.name === 'Flights' || tab.name === 'Transport') {
    return <TransportTab tripId={tripId} userId={userId} />;
  }

  if (tab.name === 'Budget') {
    return (
      <BudgetTab
        tripId={tripId}
        members={members}
        userId={userId}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  if (tab.name === 'Packing') {
    return (
      <PackingTab
        tripId={tripId}
        members={members}
        userId={userId}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  const confirmed = ideas.filter(i => i.status === 'confirmed');
  const pending = ideas.filter(i => i.status === 'idea');

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={ideas}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.ideaList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabTitle}>No ideas yet</Text>
              <Text style={styles.emptyTabSub}>Be the first to add something for {tab.name.toLowerCase()}.</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          confirmed.length > 0 ? (
            <View style={styles.sectionRow}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionLabel}>Confirmed · {confirmed.length}</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const isFirstPending = item.status === 'idea' && (index === 0 || ideas[index - 1]?.status === 'confirmed');
          return (
            <>
              {isFirstPending && pending.length > 0 && (
                <View style={styles.sectionRow}>
                  <View style={[styles.sectionDot, { backgroundColor: Colors.border }]} />
                  <Text style={styles.sectionLabel}>Ideas · {pending.length}</Text>
                </View>
              )}
              <IdeaCard
                idea={item}
                totalMembers={members.length}
                userId={userId}
                tripId={tripId}
                tripName={tripName}
                onVote={() => handleVote(item)}
                onConfirm={() => handleConfirm(item, tripName)}
                onUnconfirm={() => handleUnconfirm(item)}
              />
            </>
          );
        }}
      />
      <TouchableOpacity style={styles.aiFloatBtn} onPress={() => setShowAI(true)} activeOpacity={0.85}>
        <FontAwesome name="magic" size={13} color={Colors.primary} />
        <Text style={styles.aiFloatBtnText}>Need help with your trip?</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>+ Add idea</Text>
      </TouchableOpacity>
      <AddIdeaModal
        visible={showAdd}
        tabId={tab.id}
        tripId={tripId}
        tripName={tripName}
        userId={userId}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); loadIdeas(); }}
      />
      <AIAssistantModal
        visible={showAI}
        tab={tab}
        tripId={tripId}
        tripName={tripName}
        stops={stops}
        members={members}
        userId={userId}
        onClose={() => setShowAI(false)}
        onIdeaAdded={() => { loadIdeas(); }}
      />
    </View>
  );
}

// ─── AI Assistant Modal ───────────────────────────────────────────────────────

function AIAssistantModal({ visible, tab, tripId, tripName, stops, members, userId, onClose, onIdeaAdded }: {
  visible: boolean; tab: TripTab; tripId: string; tripName: string;
  stops: TripStop[]; members: TripMember[]; userId: string | null;
  onClose: () => void; onIdeaAdded: () => void;
}) {
  type Suggestion = { title: string; description: string; estimated_cost: number | null };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedTitles, setAddedTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) { setSuggestions([]); setError(null); setAddedTitles(new Set()); generateSuggestions(); }
  }, [visible]);

  async function generateSuggestions() {
    setLoading(true);
    setError(null);
    try {
      // Load user vibe + budget
      let vibeLabels = 'mixed';
      let budgetLabels = 'mid-range';
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles').select('travel_vibe, budget_range').eq('id', userId).single();
        if (profile?.travel_vibe?.length) vibeLabels = profile.travel_vibe.join(', ');
        if (profile?.budget_range?.length) budgetLabels = profile.budget_range.join(', ');
      }

      // Load confirmed ideas for context (avoid repeating them)
      const { data: confirmedIdeas } = await supabase
        .from('ideas').select('title').eq('trip_id', tripId).eq('status', 'confirmed');
      const confirmedTitles = (confirmedIdeas ?? []).map((i: any) => i.title);

      const destinations = stops.map(s => s.destination).filter(Boolean).join(', ') || tripName;
      const firstStop = stops[0];
      const lastStop = stops[stops.length - 1];
      const dateRange = firstStop?.start_date
        ? `${firstStop.start_date} to ${lastStop?.end_date ?? lastStop?.start_date ?? firstStop.start_date}`
        : 'dates not set';

      const prompt = `You are a travel planning assistant. Generate exactly 5 specific ${tab.name} ideas for a group trip to ${destinations}.

Trip details:
- Destination(s): ${destinations}
- Dates: ${dateRange}
- Group size: ${members.length} people
- Travel vibe: ${vibeLabels}
- Budget style: ${budgetLabels}
- Already confirmed in this trip: ${confirmedTitles.length > 0 ? confirmedTitles.slice(0, 10).join(', ') : 'none'}

Generate 5 fresh, specific, actionable recommendations for the "${tab.name}" category. Use real place names and specific activities. Do not repeat what is already confirmed.

Return ONLY a valid JSON array with no markdown, no code blocks, just raw JSON:
[{"title":"...","description":"...","estimated_cost":null}]

Rules: description is 1-2 sentences. estimated_cost is a number in EUR or null if free/varies.`;

      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
      if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
        throw new Error('Add your Anthropic API key to .env (EXPO_PUBLIC_ANTHROPIC_API_KEY)');
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
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `API error ${res.status}`);
      }

      const data = await res.json();
      const text: string = data.content?.[0]?.text ?? '';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Could not parse suggestions from AI response');
      const parsed: Suggestion[] = JSON.parse(match[0]);
      setSuggestions(parsed.slice(0, 5));
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function addIdea(s: Suggestion) {
    setAdding(s.title);
    const { data: profile } = userId
      ? await supabase.from('profiles').select('full_name').eq('id', userId).single()
      : { data: null };
    await supabase.from('ideas').insert({
      tab_id: tab.id, trip_id: tripId, created_by: userId,
      creator_name: (profile as any)?.full_name ?? 'AI assistant',
      title: s.title,
      description: s.description || null,
      estimated_cost: s.estimated_cost,
      currency: '€', status: 'idea', vote_count: 0, order_index: 0,
    });
    setAdding(null);
    setAddedTitles(prev => new Set(prev).add(s.title));
    onIdeaAdded();
  }

  const destination = stops[0]?.destination || tripName;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.aiSheet}>
        {/* Header */}
        <View style={styles.aiSheetHeader}>
          <View style={styles.aiSheetIconBox}>
            <FontAwesome name="magic" size={16} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiSheetTitle}>AI suggestions</Text>
            <Text style={styles.aiSheetSub}>{tab.name} ideas for {destination}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.aiSheetClose} activeOpacity={0.7}>
            <FontAwesome name="times" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.aiLoading}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.aiLoadingText}>Generating ideas for your trip...</Text>
            <Text style={styles.aiLoadingHint}>This takes a few seconds</Text>
          </View>
        ) : error ? (
          <View style={styles.aiError}>
            <FontAwesome name="exclamation-circle" size={28} color={Colors.textMuted} />
            <Text style={styles.aiErrorText}>{error}</Text>
            <TouchableOpacity style={styles.aiRetryBtn} onPress={generateSuggestions} activeOpacity={0.8}>
              <FontAwesome name="refresh" size={13} color={Colors.white} />
              <Text style={styles.aiRetryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.aiSuggestions} showsVerticalScrollIndicator={false}>
            <Text style={styles.aiSuggestionsHint}>
              Tap <FontAwesome name="plus" size={11} color={Colors.textMuted} /> to add a suggestion as an idea in this tab.
            </Text>
            {suggestions.map((s, i) => {
              const isAdded = addedTitles.has(s.title);
              const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${s.title} ${destination}`)}`;
              return (
                <View key={i} style={[styles.aiCard, isAdded && styles.aiCardAdded]}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.aiCardTitle}>{s.title}</Text>
                    {s.description ? <Text style={styles.aiCardDesc}>{s.description}</Text> : null}
                    {s.estimated_cost != null && (
                      <Text style={styles.aiCardCost}>~€{s.estimated_cost}</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => Linking.openURL(googleUrl)}
                      activeOpacity={0.7}
                      style={styles.aiGoogleBtn}
                    >
                      <FontAwesome name="google" size={11} color={Colors.textMuted} />
                      <Text style={styles.aiGoogleBtnText}>Search on Google</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.aiAddBtn, (adding === s.title || isAdded) && { opacity: 0.5 }]}
                    onPress={() => !isAdded && addIdea(s)}
                    disabled={adding === s.title || isAdded}
                    activeOpacity={0.8}
                  >
                    {adding === s.title ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : isAdded ? (
                      <FontAwesome name="check" size={13} color={Colors.white} />
                    ) : (
                      <FontAwesome name="plus" size={13} color={Colors.white} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
            {suggestions.length > 0 && (
              <TouchableOpacity style={styles.aiRegenerateBtn} onPress={generateSuggestions} activeOpacity={0.8}>
                <FontAwesome name="refresh" size={13} color={Colors.primary} />
                <Text style={styles.aiRegenerateText}>Generate new suggestions</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Idea Card ────────────────────────────────────────────────────────────────

function IdeaCard({ idea, totalMembers, userId, tripId, tripName, onVote, onConfirm, onUnconfirm }: {
  idea: Idea; totalMembers: number; userId: string | null; tripId: string; tripName: string;
  onVote: () => void; onConfirm: () => void; onUnconfirm: () => void;
}) {
  const isConfirmed = idea.status === 'confirmed';
  const threshold = Math.max(1, Math.ceil(totalMembers / 2));
  const progress = Math.min(1, idea.vote_count / threshold);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    supabase
      .from('idea_comments')
      .select('id', { count: 'exact', head: true })
      .eq('idea_id', idea.id)
      .then(({ count }) => setCommentCount(count ?? 0));
  }, [idea.id]);

  return (
    <View style={[styles.ideaCard, isConfirmed && styles.ideaCardConfirmed]}>
      <View style={styles.ideaTop}>
        <Text style={styles.ideaTitle}>{idea.title}</Text>
        {isConfirmed && (
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedBadgeText}>Confirmed</Text>
          </View>
        )}
      </View>

      {idea.description ? <Text style={styles.ideaDesc}>{idea.description}</Text> : null}
      {idea.url ? <Text style={styles.ideaUrl} numberOfLines={1}>{idea.url}</Text> : null}

      <View style={styles.ideaMeta}>
        {idea.estimated_cost != null && (
          <Text style={styles.ideaCost}>{idea.currency}{idea.estimated_cost}</Text>
        )}
        {idea.creator_name && (
          <Text style={styles.ideaCreator}>Added by {idea.creator_name}</Text>
        )}
      </View>

      {!isConfirmed && totalMembers > 1 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
      )}

      <View style={styles.ideaActions}>
        <TouchableOpacity style={styles.commentBtn} onPress={() => setShowComments(true)} activeOpacity={0.7}>
          <FontAwesome name="comment-o" size={13} color={Colors.textSecondary} />
          <Text style={styles.commentBtnText}>{commentCount}</Text>
        </TouchableOpacity>
        {!isConfirmed && (
          <TouchableOpacity style={styles.voteBtn} onPress={onVote} activeOpacity={0.7}>
            <FontAwesome name="thumbs-up" size={13} color={Colors.textSecondary} />
            <Text style={styles.voteBtnText}>{idea.vote_count}</Text>
          </TouchableOpacity>
        )}
        {!isConfirmed && (
          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} activeOpacity={0.7}>
            <Text style={styles.confirmBtnText}>Confirm</Text>
          </TouchableOpacity>
        )}
        {isConfirmed && (
          <TouchableOpacity style={styles.unconfirmBtn} onPress={onUnconfirm} activeOpacity={0.7}>
            <Text style={styles.unconfirmBtnText}>Move to ideas</Text>
          </TouchableOpacity>
        )}
      </View>

      {showComments && (
        <CommentsModal
          visible={showComments}
          idea={idea}
          userId={userId}
          onClose={() => {
            setShowComments(false);
            // Refresh count after closing
            supabase
              .from('idea_comments')
              .select('id', { count: 'exact', head: true })
              .eq('idea_id', idea.id)
              .then(({ count }) => setCommentCount(count ?? 0));
          }}
        />
      )}
    </View>
  );
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

function CommentsModal({ visible, idea, userId, onClose }: {
  visible: boolean; idea: Idea; userId: string | null; onClose: () => void;
}) {
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [displayName, setDisplayName] = useState<string>('');

  async function loadComments() {
    const { data } = await supabase
      .from('idea_comments')
      .select('*')
      .eq('idea_id', idea.id)
      .order('created_at', { ascending: true });
    setComments(data ?? []);
  }

  useEffect(() => {
    if (!visible) return;
    loadComments();
    if (userId) {
      supabase.from('profiles').select('full_name').eq('id', userId).single()
        .then(({ data }) => setDisplayName(data?.full_name ?? 'You'));
    }
  }, [visible, idea.id, userId]);

  useEffect(() => {
    if (!visible) return;
    const channel = supabase
      .channel(`idea-comments-${idea.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'idea_comments', filter: `idea_id=eq.${idea.id}` },
        () => loadComments()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visible, idea.id]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !userId) return;
    setSending(true);
    await supabase.from('idea_comments').insert({
      idea_id: idea.id,
      user_id: userId,
      display_name: displayName || 'You',
      content: trimmed,
    });
    setInput('');
    setSending(false);
    loadComments();
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.commentsSheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>Comments · {idea.title}</Text>
          <TouchableOpacity style={styles.commentsCloseBtn} onPress={onClose} activeOpacity={0.7}>
            <FontAwesome name="times" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.commentsList} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
          {comments.length === 0 && (
            <Text style={{ color: Colors.textMuted, fontSize: 14, textAlign: 'center', paddingTop: 24 }}>
              No comments yet. Be the first!
            </Text>
          )}
          {comments.map(c => (
            <View key={c.id} style={styles.commentItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.commentAuthor}>{c.display_name}</Text>
                <Text style={styles.commentTime}>{formatTime(c.created_at)}</Text>
              </View>
              <Text style={styles.commentText}>{c.content}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.commentsInput}>
          <TextInput
            style={styles.commentsTextInput}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.commentsSendBtn, (!input.trim() || sending) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            <FontAwesome name="send" size={14} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Idea Modal ───────────────────────────────────────────────────────────

function AddIdeaModal({ visible, tabId, tripId, tripName, userId, onClose, onAdded }: {
  visible: boolean; tabId: string; tripId: string; tripName: string;
  userId: string | null; onClose: () => void; onAdded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [cost, setCost] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!title.trim()) return;
    setLoading(true);
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId!).single();
    await supabase.from('ideas').insert({
      tab_id: tabId, trip_id: tripId, created_by: userId,
      creator_name: profile?.full_name ?? null,
      title: title.trim(),
      description: description.trim() || null,
      url: url.trim() || null,
      estimated_cost: cost ? parseFloat(cost) : null,
      currency: '€', status: 'idea', vote_count: 0, order_index: 0,
    });
    if (userId) {
      await createNotificationsForTrip(tripId, userId, 'idea_added', `New idea added: "${title.trim()}"`, tripName);
    }
    setLoading(false);
    setTitle(''); setDescription(''); setUrl(''); setCost('');
    onAdded();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add idea</Text>
          <TouchableOpacity onPress={handleAdd} disabled={loading || !title.trim()}>
            <Text style={[styles.modalAction, (!title.trim() || loading) && { opacity: 0.4 }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.modalInput, styles.modalInputLarge]}
            placeholder="What's the idea?"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
          <TextInput
            style={[styles.modalInput, styles.modalInputMulti]}
            placeholder="Details (optional)"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Link (optional)"
            placeholderTextColor={Colors.textMuted}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Estimated cost in € (optional)"
            placeholderTextColor={Colors.textMuted}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Transport Tab ────────────────────────────────────────────────────────────

const TRANSPORT_META: Record<TransportType, {
  label: string; icon: string; color: string;
  fromLabel: string; toLabel: string;
  operatorLabel: string; refLabel: string; hasRef: boolean;
}> = {
  flight: { label: 'Flight',  icon: 'plane', color: '#3D7EFF',
    fromLabel: 'From airport', toLabel: 'To airport',
    operatorLabel: 'Airline', refLabel: 'Flight no.', hasRef: true },
  train:  { label: 'Train',   icon: 'train', color: '#9B59B6',
    fromLabel: 'Departure station', toLabel: 'Arrival station',
    operatorLabel: 'Train company', refLabel: 'Train no.', hasRef: true },
  bus:    { label: 'Bus',     icon: 'bus',   color: '#E8622A',
    fromLabel: 'Departure stop', toLabel: 'Arrival stop',
    operatorLabel: 'Bus company', refLabel: 'Line / Route', hasRef: true },
  car:    { label: 'Car',     icon: 'car',   color: '#00A878',
    fromLabel: 'Starting point', toLabel: 'Destination',
    operatorLabel: 'Notes', refLabel: '', hasRef: false },
  ferry:  { label: 'Ferry',   icon: 'ship',  color: '#F5A623',
    fromLabel: 'Departure port', toLabel: 'Arrival port',
    operatorLabel: 'Ferry company', refLabel: 'Route', hasRef: true },
};

const TRANSPORT_ORDER: TransportType[] = ['flight', 'train', 'bus', 'car', 'ferry'];

function TransportTab({ tripId, userId }: { tripId: string; userId: string | null }) {
  const [legs, setLegs] = useState<Flight[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from('flights').select('*').eq('trip_id', tripId)
      .order('departure_time', { ascending: true, nullsFirst: false });
    setLegs(data ?? []);
    setLoading(false);
  }

  async function deleteLeg(id: string) {
    await supabase.from('flights').delete().eq('id', id);
    load();
  }

  useEffect(() => { load(); }, [tripId]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.ideaList} showsVerticalScrollIndicator={false}>
        {!loading && legs.length === 0 && (
          <View style={styles.emptyTab}>
            <Text style={styles.emptyTabTitle}>No journeys added</Text>
            <Text style={styles.emptyTabSub}>
              Add flights, trains, buses, car legs or ferries so everyone in the group sees the full route.
            </Text>
          </View>
        )}
        {legs.map(leg => {
          const type = (leg.transport_type ?? 'flight') as TransportType;
          const meta = TRANSPORT_META[type] ?? TRANSPORT_META.flight;
          return (
            <View key={leg.id} style={styles.flightCard}>
              {/* Type badge + route */}
              <View style={styles.transportHeader}>
                <View style={[styles.transportBadge, { backgroundColor: meta.color + '20' }]}>
                  <FontAwesome name={meta.icon as any} size={13} color={meta.color} />
                  <Text style={[styles.transportBadgeLabel, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteLeg(leg.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <FontAwesome name="times" size={13} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* From → To */}
              <View style={styles.flightRoute}>
                <Text style={styles.flightAirport} numberOfLines={1}>
                  {type === 'flight'
                    ? leg.departure_airport.toUpperCase()
                    : leg.departure_airport}
                </Text>
                <View style={styles.flightLine}>
                  <View style={styles.flightLineDash} />
                  <FontAwesome name={meta.icon as any} size={11} color={meta.color} />
                  <View style={styles.flightLineDash} />
                </View>
                <Text style={styles.flightAirport} numberOfLines={1}>
                  {type === 'flight'
                    ? leg.arrival_airport.toUpperCase()
                    : leg.arrival_airport}
                </Text>
              </View>

              {/* Operator + ref */}
              {(leg.airline || leg.flight_number) ? (
                <Text style={styles.flightNumber}>
                  {leg.airline ?? ''}{leg.airline && leg.flight_number ? ' · ' : ''}{leg.flight_number ?? ''}
                </Text>
              ) : null}

              {/* Time + price */}
              <View style={styles.flightMeta}>
                {leg.departure_time ? (
                  <Text style={styles.flightTime}>
                    {new Date(leg.departure_time).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
                {leg.price != null ? (
                  <Text style={styles.flightPrice}>{leg.currency}{leg.price}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>+ Add journey</Text>
      </TouchableOpacity>
      <AddJourneyModal visible={showAdd} tripId={tripId} userId={userId}
        onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />
    </View>
  );
}

function AddJourneyModal({ visible, tripId, userId, onClose, onAdded }: {
  visible: boolean; tripId: string; userId: string | null; onClose: () => void; onAdded: () => void;
}) {
  const [type, setType] = useState<TransportType>('flight');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [operator, setOperator] = useState('');
  const [ref, setRef] = useState('');
  const [depTime, setDepTime] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const meta = TRANSPORT_META[type];

  function reset() {
    setType('flight'); setFrom(''); setTo('');
    setOperator(''); setRef(''); setDepTime(''); setPrice('');
  }

  async function handleAdd() {
    if (!from.trim() || !to.trim()) return;
    setLoading(true);
    // Parse departure time (accept "DD/MM HH:MM" or ISO)
    let depTimeVal: string | null = null;
    if (depTime.trim()) {
      const parsed = new Date(depTime.trim());
      if (!isNaN(parsed.getTime())) depTimeVal = parsed.toISOString();
    }
    await supabase.from('flights').insert({
      trip_id: tripId,
      transport_type: type,
      departure_airport: from.trim(),
      arrival_airport: to.trim(),
      airline: operator.trim() || null,
      flight_number: ref.trim() || null,
      departure_time: depTimeVal,
      price: price ? parseFloat(price) : null,
      currency: '€',
      added_by: userId,
    });
    setLoading(false);
    reset();
    onAdded();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { onClose(); reset(); }}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add journey</Text>
          <TouchableOpacity onPress={handleAdd} disabled={loading || !from.trim() || !to.trim()}>
            <Text style={[styles.modalAction, (!from.trim() || !to.trim() || loading) && { opacity: 0.4 }]}>
              {loading ? 'Adding...' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* Transport type selector */}
          <Text style={styles.editLabel}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TRANSPORT_ORDER.map(t => {
                const m = TRANSPORT_META[t];
                const active = type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.transportChip, active && { backgroundColor: m.color + '22', borderColor: m.color }]}
                    onPress={() => { setType(t); setFrom(''); setTo(''); setOperator(''); setRef(''); }}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name={m.icon as any} size={13} color={active ? m.color : Colors.textMuted} />
                    <Text style={[styles.transportChipText, active && { color: m.color, fontWeight: '700' }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* From */}
          <Text style={styles.editLabel}>{meta.fromLabel}</Text>
          {type === 'flight' ? (
            <AirportSearchInput value={from} onChangeText={setFrom}
              placeholder="City or airport code (e.g. LIS, London)" autoFocus />
          ) : (
            <TextInput style={styles.modalInput} value={from} onChangeText={setFrom}
              placeholder={meta.fromLabel} placeholderTextColor={Colors.textMuted} autoFocus />
          )}

          <View style={styles.flightArrowRow}>
            <FontAwesome name="long-arrow-down" size={16} color={Colors.textMuted} />
          </View>

          {/* To */}
          <Text style={styles.editLabel}>{meta.toLabel}</Text>
          {type === 'flight' ? (
            <AirportSearchInput value={to} onChangeText={setTo}
              placeholder="City or airport code (e.g. BCN, Tokyo)" />
          ) : (
            <TextInput style={styles.modalInput} value={to} onChangeText={setTo}
              placeholder={meta.toLabel} placeholderTextColor={Colors.textMuted} />
          )}

          {/* Operator */}
          <Text style={styles.editLabel}>
            {meta.operatorLabel}{' '}
            <Text style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: Colors.textMuted }}>(optional)</Text>
          </Text>
          {type === 'flight' ? (
            <AirlineSearchInput value={operator} onChangeText={setOperator} placeholder="Airline (optional)" />
          ) : (
            <TextInput style={styles.modalInput} value={operator} onChangeText={setOperator}
              placeholder={`${meta.operatorLabel} (optional)`} placeholderTextColor={Colors.textMuted} />
          )}

          {/* Reference number */}
          {meta.hasRef && (
            <>
              <Text style={styles.editLabel}>
                {meta.refLabel}{' '}
                <Text style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: Colors.textMuted }}>(optional)</Text>
              </Text>
              <TextInput style={styles.modalInput} value={ref} onChangeText={setRef}
                placeholder={`${meta.refLabel} (optional)`} placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters" />
            </>
          )}

          {/* Departure time */}
          <Text style={styles.editLabel}>
            Departure{' '}
            <Text style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: Colors.textMuted }}>(optional)</Text>
          </Text>
          <TextInput style={styles.modalInput} value={depTime} onChangeText={setDepTime}
            placeholder="e.g. 2025-06-15 09:30" placeholderTextColor={Colors.textMuted} />

          {/* Price */}
          <Text style={styles.editLabel}>
            Price{' '}
            <Text style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: Colors.textMuted }}>(optional)</Text>
          </Text>
          <TextInput style={styles.modalInput} value={price} onChangeText={setPrice}
            placeholder="Price in €" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────

function BudgetTab({ tripId, members, userId, refreshing, onRefresh }: {
  tripId: string; members: TripMember[]; userId: string | null;
  refreshing: boolean; onRefresh: () => void;
}) {
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  async function loadExpenses() {
    const { data } = await supabase
      .from('trip_expenses')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    setExpenses(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadExpenses(); }, [tripId]);

  useEffect(() => {
    const channel = supabase
      .channel(`budget-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_expenses', filter: `trip_id=eq.${tripId}` }, () => loadExpenses())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const perPerson = members.length > 0 ? total / members.length : 0;

  function expenseInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  const AVATAR_COLORS = ['#E8622A', '#3D7EFF', '#00A878', '#F5A623', '#9B59B6', '#E74C3C'];
  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.ideaList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Summary card */}
        <View style={styles.budgetSummaryCard}>
          <View style={styles.budgetSummaryItem}>
            <Text style={styles.budgetSummaryLabel}>Total spent</Text>
            <Text style={styles.budgetSummaryValue}>€{total.toFixed(2)}</Text>
          </View>
          <View style={styles.budgetSummaryDivider} />
          <View style={styles.budgetSummaryItem}>
            <Text style={styles.budgetSummaryLabel}>Per person</Text>
            <Text style={[styles.budgetSummaryValue, { color: Colors.primary }]}>
              €{perPerson.toFixed(2)}
            </Text>
          </View>
        </View>

        {!loading && expenses.length === 0 && (
          <View style={styles.emptyTab}>
            <Text style={styles.emptyTabTitle}>No expenses yet</Text>
            <Text style={styles.emptyTabSub}>Track who paid what and split costs easily.</Text>
          </View>
        )}

        {expenses.map(expense => (
          <View key={expense.id} style={styles.expenseCard}>
            <View style={[styles.expenseAvatar, { backgroundColor: avatarColor(expense.paid_by_name) }]}>
              <Text style={styles.expenseAvatarText}>{expenseInitials(expense.paid_by_name)}</Text>
            </View>
            <View style={styles.expenseInfo}>
              <Text style={styles.expenseTitle}>{expense.title}</Text>
              <Text style={styles.expensePaidBy}>Paid by {expense.paid_by_name}</Text>
            </View>
            <Text style={styles.expenseAmount}>{expense.currency} {Number(expense.amount).toFixed(2)}</Text>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>＋ Add expense</Text>
      </TouchableOpacity>

      <AddExpenseModal
        visible={showAdd}
        tripId={tripId}
        members={members}
        userId={userId}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); loadExpenses(); }}
      />
    </View>
  );
}

function AddExpenseModal({ visible, tripId, members, userId, onClose, onAdded }: {
  visible: boolean; tripId: string; members: TripMember[];
  userId: string | null; onClose: () => void; onAdded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Pre-select current user
    const me = members.find(m => m.user_id === userId);
    if (me) setSelectedMemberId(me.id);
    else if (members.length > 0) setSelectedMemberId(members[0].id);
  }, [visible, members, userId]);

  async function handleAdd() {
    if (!title.trim() || !amount) return;
    const payer = members.find(m => m.id === selectedMemberId);
    if (!payer) return;
    setLoading(true);
    await supabase.from('trip_expenses').insert({
      trip_id: tripId,
      title: title.trim(),
      amount: parseFloat(amount),
      currency,
      paid_by_user_id: payer.user_id ?? null,
      paid_by_name: payer.display_name,
    });
    setLoading(false);
    setTitle(''); setAmount(''); setCurrency('EUR');
    onAdded();
  }

  const CURRENCIES = ['EUR', 'USD', 'GBP'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add expense</Text>
          <TouchableOpacity onPress={handleAdd} disabled={loading || !title.trim() || !amount}>
            <Text style={[styles.modalAction, (!title.trim() || !amount || loading) && { opacity: 0.4 }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.modalInput, styles.modalInputLarge]}
            placeholder="What was this expense?"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
          <TextInput
            style={styles.modalInput}
            placeholder="Amount"
            placeholderTextColor={Colors.textMuted}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />

          <Text style={styles.editLabel}>Currency</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.statusChip, { flex: 0, paddingHorizontal: 20 }, currency === c && styles.statusChipActive]}
                onPress={() => setCurrency(c)}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusChipText, currency === c && styles.statusChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.editLabel}>Who paid?</Text>
          <View style={styles.memberGrid}>
            {members.map(m => {
              const isSelected = selectedMemberId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberChip, isSelected && styles.memberChipActive]}
                  onPress={() => setSelectedMemberId(m.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.memberAvatar, isSelected && styles.memberAvatarActive]}>
                    <Text style={[styles.memberAvatarText, isSelected && styles.memberAvatarTextActive]}>
                      {memberInitials(m.display_name)}
                    </Text>
                  </View>
                  <Text style={[styles.memberName, isSelected && styles.memberNameActive]}>
                    {m.user_id === userId ? 'You' : m.display_name.split(' ')[0]}
                  </Text>
                  {isSelected && <FontAwesome name="check" size={10} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Packing Tab ──────────────────────────────────────────────────────────────

function PackingTab({ tripId, members, userId, refreshing, onRefresh }: {
  tripId: string; members: TripMember[]; userId: string | null;
  refreshing: boolean; onRefresh: () => void;
}) {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  async function loadItems() {
    const { data } = await supabase
      .from('packing_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('checked', { ascending: true })
      .order('created_at', { ascending: true });
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadItems(); }, [tripId]);

  useEffect(() => {
    if (userId) {
      supabase.from('profiles').select('full_name').eq('id', userId).single()
        .then(({ data }) => setCurrentUserName(data?.full_name ?? 'Someone'));
    }
  }, [userId]);

  useEffect(() => {
    const channel = supabase
      .channel(`packing-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packing_items', filter: `trip_id=eq.${tripId}` }, () => loadItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  async function toggleItem(item: PackingItem) {
    await supabase.from('packing_items')
      .update({ checked: !item.checked, checked_by_name: !item.checked ? currentUserName : null })
      .eq('id', item.id);
    loadItems();
  }

  async function quickAdd() {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    await supabase.from('packing_items').insert({
      trip_id: tripId,
      title: trimmed,
      created_by: userId ?? null,
      checked: false,
    });
    setNewItemText('');
    loadItems();
  }

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
  const total = items.length;
  const checkedCount = checked.length;
  const progress = total > 0 ? checkedCount / total : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.ideaList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Progress bar */}
        <View style={styles.packingProgressCard}>
          <View style={styles.packingProgressHeader}>
            <Text style={styles.packingProgressLabel}>
              {checkedCount} / {total} packed
            </Text>
            {total > 0 && checkedCount === total && (
              <Text style={styles.packingAllDone}>All done!</Text>
            )}
          </View>
          <View style={styles.packingProgressTrack}>
            <View style={[styles.packingProgressFill, { width: `${progress * 100}%` as any }]} />
          </View>
        </View>

        {/* Quick add input */}
        <View style={styles.packingQuickAdd}>
          <TextInput
            style={styles.packingQuickInput}
            placeholder="Quick add item..."
            placeholderTextColor={Colors.textMuted}
            value={newItemText}
            onChangeText={setNewItemText}
            returnKeyType="done"
            onSubmitEditing={quickAdd}
          />
          <TouchableOpacity
            style={[styles.packingQuickBtn, !newItemText.trim() && { opacity: 0.4 }]}
            onPress={quickAdd}
            disabled={!newItemText.trim()}
            activeOpacity={0.8}
          >
            <FontAwesome name="plus" size={14} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {!loading && items.length === 0 && (
          <View style={styles.emptyTab}>
            <Text style={styles.emptyTabTitle}>Nothing packed yet</Text>
            <Text style={styles.emptyTabSub}>Add items to track what everyone needs to bring.</Text>
          </View>
        )}

        {/* Still needed section */}
        {unchecked.length > 0 && (
          <View style={styles.sectionRow}>
            <View style={[styles.sectionDot, { backgroundColor: Colors.border }]} />
            <Text style={styles.sectionLabel}>Still needed · {unchecked.length}</Text>
          </View>
        )}
        {unchecked.map(item => (
          <PackingItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} />
        ))}

        {/* Packed section */}
        {checked.length > 0 && (
          <View style={[styles.sectionRow, { marginTop: 8 }]}>
            <View style={[styles.sectionDot, { backgroundColor: Colors.green }]} />
            <Text style={styles.sectionLabel}>Packed · {checked.length}</Text>
          </View>
        )}
        {checked.map(item => (
          <PackingItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} />
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>＋ Add item</Text>
      </TouchableOpacity>

      <AddPackingItemModal
        visible={showAdd}
        tripId={tripId}
        members={members}
        userId={userId}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); loadItems(); }}
      />
    </View>
  );
}

function PackingItemRow({ item, onToggle }: { item: PackingItem; onToggle: () => void }) {
  return (
    <View style={styles.packingRow}>
      <TouchableOpacity style={styles.packingCheckbox} onPress={onToggle} activeOpacity={0.7}>
        {item.checked ? (
          <View style={styles.packingCheckboxChecked}>
            <FontAwesome name="check" size={10} color={Colors.white} />
          </View>
        ) : (
          <View style={styles.packingCheckboxEmpty} />
        )}
      </TouchableOpacity>
      <View style={styles.packingRowInfo}>
        <Text style={[styles.packingItemTitle, item.checked && styles.packingItemTitleChecked]}>
          {item.title}
        </Text>
        {item.assigned_to_name && (
          <View style={styles.packingAssignedBadge}>
            <Text style={styles.packingAssignedText}>{item.assigned_to_name}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function AddPackingItemModal({ visible, tripId, members, userId, onClose, onAdded }: {
  visible: boolean; tripId: string; members: TripMember[];
  userId: string | null; onClose: () => void; onAdded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assignedId, setAssignedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!title.trim()) return;
    const assignedMember = members.find(m => m.id === assignedId);
    setLoading(true);
    await supabase.from('packing_items').insert({
      trip_id: tripId,
      title: title.trim(),
      assigned_to_user_id: assignedMember?.user_id ?? null,
      assigned_to_name: assignedMember?.display_name ?? null,
      created_by: userId ?? null,
      checked: false,
    });
    setLoading(false);
    setTitle(''); setAssignedId(null);
    onAdded();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add item</Text>
          <TouchableOpacity onPress={handleAdd} disabled={loading || !title.trim()}>
            <Text style={[styles.modalAction, (!title.trim() || loading) && { opacity: 0.4 }]}>Add</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.modalInput, styles.modalInputLarge]}
            placeholder="What needs to be packed?"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
          <Text style={styles.editLabel}>Assign to (optional)</Text>
          <View style={styles.memberGrid}>
            <TouchableOpacity
              style={[styles.memberChip, assignedId === null && styles.memberChipActive]}
              onPress={() => setAssignedId(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.memberName, assignedId === null && styles.memberNameActive]}>Anyone</Text>
            </TouchableOpacity>
            {members.map(m => {
              const isSelected = assignedId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberChip, isSelected && styles.memberChipActive]}
                  onPress={() => setAssignedId(isSelected ? null : m.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.memberAvatar, isSelected && styles.memberAvatarActive]}>
                    <Text style={[styles.memberAvatarText, isSelected && styles.memberAvatarTextActive]}>
                      {memberInitials(m.display_name)}
                    </Text>
                  </View>
                  <Text style={[styles.memberName, isSelected && styles.memberNameActive]}>
                    {m.user_id === userId ? 'You' : m.display_name.split(' ')[0]}
                  </Text>
                  {isSelected && <FontAwesome name="check" size={10} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit Trip Modal ──────────────────────────────────────────────────────────

interface EditStop {
  id?: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
}

function formatDateShort(d: string | null) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function calcNights(start: string, end: string) {
  return Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
}
function capitalizeWords(s: string) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
function memberInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function EditTripModal({ visible, trip, initialStops, currentMembers, onClose, onSaved }: {
  visible: boolean; trip: Trip; initialStops: TripStop[];
  currentMembers: TripMember[];
  onClose: () => void;
  onSaved: (updated: Trip) => void;
}) {
  const isSplit = !!trip.parent_trip_id;

  const [name, setName] = useState(trip.name);
  const [peopleCount, setPeopleCount] = useState<string>(trip.people_count ? String(trip.people_count) : '');
  const [status, setStatus] = useState(trip.status);
  const [editStops, setEditStops] = useState<EditStop[]>([]);
  const [calendarFor, setCalendarFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Member picker state (splits only)
  const [parentMembers, setParentMembers] = useState<TripMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(trip.name);
      setPeopleCount(trip.people_count ? String(trip.people_count) : '');
      setStatus(trip.status);
      setEditStops(
        initialStops.length
          ? initialStops.map(s => ({ id: s.id, destination: s.destination, start_date: s.start_date, end_date: s.end_date }))
          : [{ destination: '', start_date: null, end_date: null }]
      );

      if (isSplit && trip.parent_trip_id) {
        setLoadingMembers(true);
        supabase.auth.getUser().then(({ data: { user } }) => {
          setCurrentUserId(user?.id ?? null);
          supabase.from('trip_members').select('*').eq('trip_id', trip.parent_trip_id!).then(({ data }) => {
            const pMembers = data ?? [];
            setParentMembers(pMembers);
            // Pre-select currently active members
            const activeIds = new Set(currentMembers.map(m => m.user_id));
            const preSelected = new Set(pMembers.filter(m => m.user_id && activeIds.has(m.user_id)).map(m => m.id));
            setSelectedMemberIds(preSelected);
            setLoadingMembers(false);
          });
        });
      }
    }
  }, [visible]);

  function addStop() {
    setEditStops(s => [...s, { destination: '', start_date: null, end_date: null }]);
  }
  function removeStop(i: number) {
    if (editStops.length === 1) return;
    setEditStops(s => s.filter((_, idx) => idx !== i));
  }
  function updateDestination(i: number, val: string) {
    setEditStops(s => s.map((stop, idx) => idx === i ? { ...stop, destination: val } : stop));
  }
  function updateDates(i: number, start: string | null, end: string | null) {
    setEditStops(s => s.map((stop, idx) => idx === i ? { ...stop, start_date: start, end_date: end } : stop));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    // For splits, people_count = selected members; for regular trips, use manual input
    const finalPeopleCount = isSplit
      ? selectedMemberIds.size
      : (peopleCount ? parseInt(peopleCount, 10) : null);

    // Update trip record
    const { data: updatedTrip, error } = await supabase
      .from('trips')
      .update({ name: name.trim(), people_count: finalPeopleCount, status })
      .eq('id', trip.id).select().single();

    if (error || !updatedTrip) { setSaving(false); return; }

    // Sync members for splits
    if (isSplit) {
      const selectedParentMembers = parentMembers.filter(m => selectedMemberIds.has(m.id));
      const selectedUserIds = new Set(selectedParentMembers.map(m => m.user_id));
      const currentUserIds = new Set(currentMembers.map(m => m.user_id));

      // Add newly selected members
      const toAdd = selectedParentMembers.filter(m => m.user_id && !currentUserIds.has(m.user_id));
      if (toAdd.length) {
        await supabase.from('trip_members').insert(
          toAdd.map(m => ({
            trip_id: trip.id,
            user_id: m.user_id,
            display_name: m.display_name,
            role: 'member' as const,
          }))
        );
      }

      // Remove deselected members (never remove the owner / current user)
      const toRemove = currentMembers.filter(
        m => m.user_id && !selectedUserIds.has(m.user_id) && m.user_id !== currentUserId
      );
      if (toRemove.length) {
        await supabase.from('trip_members').delete().in('id', toRemove.map(m => m.id));
      }
    }

    // Delete removed stops
    const keptIds = editStops.filter(s => s.id).map(s => s.id!);
    const deletedIds = initialStops.map(s => s.id).filter(id => !keptIds.includes(id));
    if (deletedIds.length) {
      await supabase.from('trip_stops').delete().in('id', deletedIds);
    }

    // Upsert stops
    const upsertData = editStops
      .filter(s => s.destination.trim())
      .map((s, i) => ({
        ...(s.id ? { id: s.id } : {}),
        trip_id: trip.id,
        destination: s.destination.trim(),
        start_date: s.start_date ?? null,
        end_date: s.end_date ?? null,
        order_index: i,
      }));
    if (upsertData.length) {
      await supabase.from('trip_stops').upsert(upsertData);
    }

    setSaving(false);
    onSaved(updatedTrip as Trip);
  }

  const STATUS_OPTIONS: Array<{ value: Trip['status']; label: string }> = [
    { value: 'planning', label: 'Planning' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
  ];

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit trip</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim()}>
              <Text style={[styles.modalAction, (saving || !name.trim()) && { opacity: 0.4 }]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.editLabel}>Trip name</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputLarge]}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="next"
            />

            {isSplit ? (
              <>
                <Text style={styles.editLabel}>Who's going</Text>
                <Text style={styles.editMemberHint}>Select members from the parent trip. You're always included.</Text>
                {loadingMembers ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginVertical: 8 }} />
                ) : (
                  <View style={styles.memberGrid}>
                    {parentMembers.map(m => {
                      const isSelected = selectedMemberIds.has(m.id);
                      const isMe = m.user_id === currentUserId;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.memberChip, isSelected && styles.memberChipActive]}
                          onPress={() => {
                            if (isMe) return;
                            setSelectedMemberIds(prev => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.memberAvatar, isSelected && styles.memberAvatarActive]}>
                            <Text style={[styles.memberAvatarText, isSelected && styles.memberAvatarTextActive]}>
                              {memberInitials(m.display_name)}
                            </Text>
                          </View>
                          <Text style={[styles.memberName, isSelected && styles.memberNameActive]}>
                            {isMe ? 'You' : m.display_name.split(' ')[0]}
                          </Text>
                          {isSelected && <FontAwesome name="check" size={10} color={Colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {selectedMemberIds.size > 0 && (
                  <Text style={styles.memberSelectedCount}>
                    {selectedMemberIds.size} {selectedMemberIds.size === 1 ? 'person' : 'people'} selected
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.editLabel}>People going</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 6"
                  placeholderTextColor={Colors.textMuted}
                  value={peopleCount}
                  onChangeText={v => setPeopleCount(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </>
            )}

            <Text style={styles.editLabel}>Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.statusChip, status === opt.value && styles.statusChipActive]}
                  onPress={() => setStatus(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.statusChipText, status === opt.value && styles.statusChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.editLabel}>Stops</Text>
            {editStops.map((stop, i) => (
              <View key={i} style={styles.editStopCard}>
                <View style={styles.editStopRow}>
                  <View style={styles.stopNumber}>
                    <Text style={styles.stopNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.editStopLabel}>Stop {i + 1}</Text>
                  {editStops.length > 1 && (
                    <TouchableOpacity onPress={() => removeStop(i)} style={{ padding: 6 }}>
                      <FontAwesome name="times" size={13} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <CitySearchInput
                  value={stop.destination}
                  onChangeText={v => updateDestination(i, v)}
                  placeholder="City or place"
                />

                <TouchableOpacity
                  style={styles.editDateBtn}
                  onPress={() => setCalendarFor(i)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="calendar-o" size={13} color={Colors.textSecondary} />
                  {stop.start_date ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.editDateSelected}>
                        {formatDateShort(stop.start_date)}
                        {stop.end_date ? ` → ${formatDateShort(stop.end_date)}` : ''}
                      </Text>
                      {stop.start_date && stop.end_date && (
                        <Text style={styles.editDateNights}>
                          {calcNights(stop.start_date, stop.end_date)} nights
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.editDatePlaceholder}>Select dates</Text>
                  )}
                  <FontAwesome name="angle-right" size={13} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.editAddStopBtn} onPress={addStop} activeOpacity={0.7}>
              <Text style={styles.editAddStopText}>+ Add stop</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <CalendarPicker
        visible={calendarFor !== null}
        startDate={calendarFor !== null ? editStops[calendarFor]?.start_date ?? null : null}
        endDate={calendarFor !== null ? editStops[calendarFor]?.end_date ?? null : null}
        title="Select dates"
        onClose={() => setCalendarFor(null)}
        onConfirm={(start, end) => {
          if (calendarFor !== null) updateDates(calendarFor, start, end);
          setCalendarFor(null);
        }}
      />
    </>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ visible, trip, onClose }: {
  visible: boolean; trip: Trip; onClose: () => void;
}) {
  const inviteLink = `Join my trip "${trip.name}" on Wayfarer!\n\ntripapp://join/${trip.invite_code}`;
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      await Share.share({ message: inviteLink });
    } catch {}
  }

  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`tripapp://join/${trip.invite_code}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.inviteSheet}>
        <View style={styles.modalHeader}>
          <View style={{ width: 56 }} />
          <Text style={styles.modalTitle}>Invite friends</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inviteBody}>
          <View style={styles.inviteCard}>
            <View style={styles.invitePlaneIcon}>
              <FontAwesome name="plane" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.inviteTripName}>{trip.name}</Text>
            <Text style={styles.inviteCodeLabel}>Invite code</Text>
            <Text style={styles.inviteCode}>{trip.invite_code}</Text>
          </View>

          <Text style={styles.inviteHint}>
            Share this code or send the link below. Anyone with it can join this trip.
          </Text>

          <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.8}>
            <FontAwesome name={copied ? 'check' : 'copy'} size={15} color={copied ? Colors.green : Colors.text} />
            <Text style={[styles.copyBtnText, copied && { color: Colors.green }]}>
              {copied ? 'Copied!' : 'Copy invite link'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <FontAwesome name="share" size={15} color={Colors.white} />
            <Text style={styles.shareBtnText}>Share via...</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(first: TripStop, last: TripStop): string {
  if (!first.start_date) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(first.start_date).toLocaleDateString('en', opts);
  if (last.end_date && last.end_date !== first.start_date) {
    return `${start} – ${new Date(last.end_date).toLocaleDateString('en', opts)}`;
  }
  return start;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },

  // Menu
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 100, paddingRight: 16,
  },
  menuSheet: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    minWidth: 180,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 15,
  },
  menuItemText: { fontSize: 15, fontWeight: '500', color: Colors.text },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },

  // Stats bar
  statsBar: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 5, paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.card,
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  statPillUrgent: { backgroundColor: Colors.primaryDim, borderColor: Colors.primary },
  statPillText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  statPillTextUrgent: { color: Colors.primary, fontWeight: '600' },

  // Tab bar
  tabBarScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: 'transparent',
    minWidth: 36, justifyContent: 'center',
  },
  tabBtnInactive: { paddingHorizontal: 10 },
  tabBtnActive: { backgroundColor: Colors.card, borderColor: Colors.border },
  tabBtnSplits: { borderColor: Colors.primaryDim },
  tabLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  tabLabelActive: { color: Colors.text, fontWeight: '700' },
  tabLabelSplits: { color: Colors.textMuted },
  tabLabelSplitsActive: { color: Colors.primary, fontWeight: '700' },

  // Parent breadcrumb
  parentCrumb: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.primaryDim,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  parentCrumbText: { fontSize: 12, color: Colors.textSecondary },
  parentCrumbName: { fontWeight: '700', color: Colors.primary },

  // Splits tab
  splitsList: { padding: 16, paddingBottom: 100, gap: 10 },
  splitsEmpty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  splitsEmptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  splitsEmptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  splitsEmptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },

  splitCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  splitCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  splitForkIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center',
  },
  splitCardInfo: { flex: 1, gap: 4 },
  splitCardName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  splitCardNote: { fontSize: 13, color: Colors.textSecondary },
  splitCardMeta: { flexDirection: 'row', gap: 6, marginTop: 2 },
  splitMetaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.backgroundAlt, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  splitMetaText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },

  splitFab: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  splitFabText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  // Ideas list
  ideaList: { padding: 16, paddingBottom: 100, gap: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2 },
  sectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.green },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Idea card
  ideaCard: {
    backgroundColor: Colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 8,
  },
  ideaCardConfirmed: { borderColor: Colors.green, backgroundColor: Colors.successDim },
  ideaTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  ideaTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, flex: 1 },
  confirmedBadge: {
    backgroundColor: Colors.green, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8,
  },
  confirmedBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white },
  ideaDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  ideaUrl: { fontSize: 12, color: Colors.accent },
  ideaMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  ideaCost: { fontSize: 14, fontWeight: '700', color: Colors.text },
  ideaCreator: { fontSize: 12, color: Colors.textMuted },
  progressBar: { height: 3, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: Colors.primary, borderRadius: 2 },
  ideaActions: { flexDirection: 'row', gap: 8 },
  voteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
  },
  voteBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  confirmBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.text, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  unconfirmBtn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  unconfirmBtnText: { fontSize: 12, color: Colors.textSecondary },

  // Empty
  emptyTab: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTabTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyTabSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    backgroundColor: Colors.text,
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  // Flights
  flightCard: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 8,
  },
  flightRoute: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flightAirport: { fontSize: 24, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  flightLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  flightLineDash: { flex: 1, height: 1, backgroundColor: Colors.border },
  flightNumber: { fontSize: 13, color: Colors.textSecondary },
  flightMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  flightTime: { fontSize: 13, color: Colors.textMuted },
  flightPrice: { fontSize: 15, fontWeight: '700', color: Colors.text },
  flightFromTo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  flightArrowRow: { alignItems: 'center', paddingVertical: 4 },

  // Modal
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 15, color: Colors.textSecondary, width: 56 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  modalAction: { fontSize: 15, fontWeight: '700', color: Colors.primary, width: 56, textAlign: 'right' },
  modalBody: { padding: 20, gap: 10 },
  modalInput: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.text,
  },
  modalInputLarge: { fontSize: 17, fontWeight: '600' },
  modalInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  editLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, marginTop: 6,
  },
  // Stop number (shared)
  stopNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stopNumberText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },

  // Edit stop card
  editStopCard: {
    backgroundColor: Colors.backgroundAlt, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, gap: 8, marginBottom: 8,
  },
  editStopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editStopLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  editDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.card,
  },
  editDateSelected: { fontSize: 14, fontWeight: '600', color: Colors.text },
  editDateNights: {
    fontSize: 11, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primaryDim, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  editDatePlaceholder: { flex: 1, fontSize: 14, color: Colors.textMuted },
  editAddStopBtn: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 2,
  },
  editAddStopText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },

  // Member picker (used inside EditTripModal for splits)
  editMemberHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginTop: -4 },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 40, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  memberChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  memberAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarActive: { backgroundColor: Colors.primary + '30' },
  memberAvatarText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  memberAvatarTextActive: { color: Colors.primary },
  memberName: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  memberNameActive: { color: Colors.primary },
  memberSelectedCount: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2 },

  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  statusChipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  statusChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  statusChipTextActive: { color: Colors.white },

  // Invite
  inviteSheet: { flex: 1, backgroundColor: Colors.background },
  inviteBody: { padding: 24, gap: 16, alignItems: 'center' },
  inviteCard: {
    width: '100%', backgroundColor: Colors.card,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 28, alignItems: 'center', gap: 8,
  },
  invitePlaneIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  inviteTripName: { fontSize: 20, fontWeight: '700', color: Colors.text, letterSpacing: -0.3 },
  inviteCodeLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12 },
  inviteCode: { fontSize: 32, fontWeight: '800', color: Colors.text, letterSpacing: 6 },
  inviteHint: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  copyBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  copyBtnText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  shareBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, borderRadius: 10, backgroundColor: Colors.text,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // Delete confirmation modal
  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  confirmSheet: {
    width: '100%', backgroundColor: Colors.card,
    borderRadius: 18, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
    gap: 8,
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  confirmBody: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: 8 },
  confirmDeleteBtn: {
    backgroundColor: '#E53E3E', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  confirmDeleteText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  confirmCancelBtn: {
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  confirmCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },

  // Comments
  commentBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
  },
  commentBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  commentsSheet: { flex: 1, backgroundColor: Colors.background },
  commentsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8 },
  commentsCloseBtn: { padding: 4 },
  commentsList: { flex: 1, padding: 16 },
  commentItem: { gap: 4 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: Colors.text },
  commentTime: { fontSize: 11, color: Colors.textMuted },
  commentText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  commentsInput: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 14, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  commentsTextInput: {
    flex: 1, backgroundColor: Colors.card,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.text, maxHeight: 100,
  },
  commentsSendBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Budget tab
  budgetSummaryCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', padding: 20, marginBottom: 4,
  },
  budgetSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  budgetSummaryDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  budgetSummaryLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  budgetSummaryValue: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  expenseCard: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  expenseAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  expenseAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  expenseInfo: { flex: 1, gap: 2 },
  expenseTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  expensePaidBy: { fontSize: 12, color: Colors.textSecondary },
  expenseAmount: { fontSize: 16, fontWeight: '800', color: Colors.text },

  // Packing tab
  packingProgressCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 10, marginBottom: 4,
  },
  packingProgressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  packingProgressLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  packingAllDone: { fontSize: 12, fontWeight: '700', color: Colors.green },
  packingProgressTrack: {
    height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden',
  },
  packingProgressFill: { height: 6, backgroundColor: Colors.green, borderRadius: 3 },
  packingQuickAdd: {
    flexDirection: 'row', gap: 8, marginBottom: 4,
  },
  packingQuickInput: {
    flex: 1, backgroundColor: Colors.card,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text,
  },
  packingQuickBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  packingRow: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  packingCheckbox: { flexShrink: 0 },
  packingCheckboxEmpty: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border,
  },
  packingCheckboxChecked: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  packingRowInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  packingItemTitle: { fontSize: 15, fontWeight: '500', color: Colors.text },
  packingItemTitleChecked: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  packingAssignedBadge: {
    backgroundColor: Colors.primaryDim, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  packingAssignedText: { fontSize: 11, fontWeight: '600', color: Colors.primary },

  // Map tab
  mapLoadingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mapLoadingText: { fontSize: 13, color: Colors.textSecondary },
  mapFallback: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  mapFallbackIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  mapFallbackTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  mapFallbackSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  mapStopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    width: '100%', backgroundColor: Colors.card,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  mapStopText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },

  // Itinerary tab
  itineraryEmpty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  itineraryEmptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  itineraryEmptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  itineraryEmptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },

  daySelectorScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card },
  daySelectorContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  dayChip: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent', minWidth: 52,
  },
  dayChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipName: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  dayChipNameSelected: { color: Colors.white },
  dayChipNum: { fontSize: 20, fontWeight: '800', color: Colors.text, lineHeight: 24 },
  dayChipNumSelected: { color: Colors.white },
  dayChipMonth: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  dayChipMonthSelected: { color: Colors.white + 'CC' },
  dayChipTodayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 2 },
  dayChipTodayDotSelected: { backgroundColor: Colors.white },

  dayDestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.primaryDim, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dayDestText: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  itineraryList: { paddingHorizontal: 16, paddingTop: 16 },
  itineraryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  itineraryTimeCol: { width: 44, alignItems: 'center', paddingTop: 14 },
  itineraryTime: { fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  itineraryTimeEmpty: { fontSize: 16, color: Colors.border, textAlign: 'center' },
  itineraryConnector: { flex: 1, width: 1, backgroundColor: Colors.border, marginTop: 6 },
  itineraryCard: {
    flex: 1, backgroundColor: Colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, padding: 12, gap: 4,
  },
  itineraryCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itineraryCatIcon: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itineraryCardTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 19 },
  itineraryCardDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, paddingLeft: 34 },
  itineraryCatLabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', paddingLeft: 34 },

  dayEmpty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 8 },
  dayEmptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  dayEmptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  dayImportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    backgroundColor: Colors.card, alignSelf: 'center', marginTop: 8,
  },
  dayImportBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // Category chips in AddItineraryItemModal
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  catChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  // Import ideas modal
  importIdeaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  importIdeaRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
  importIdeaCheck: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  importIdeaCheckSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  importIdeaTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  importIdeaDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  importIdeaCost: { fontSize: 13, fontWeight: '700', color: Colors.text },

  // AI assistant float button
  aiFloatBtn: {
    position: 'absolute', bottom: 72, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.primary + '44',
    paddingHorizontal: 16, paddingVertical: 9,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  aiFloatBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // AI assistant modal sheet
  aiSheet: { flex: 1, backgroundColor: Colors.background },
  aiSheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  aiSheetIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center',
  },
  aiSheetTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  aiSheetSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  aiSheetClose: { padding: 4 },

  aiLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 60 },
  aiLoadingText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  aiLoadingHint: { fontSize: 13, color: Colors.textMuted },

  aiError: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32, paddingBottom: 60 },
  aiErrorText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  aiRetryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 11,
  },
  aiRetryText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  aiSuggestions: { padding: 16, gap: 10 },
  aiSuggestionsHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 4, lineHeight: 18 },
  aiCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  aiCardAdded: { borderColor: Colors.green + '55', backgroundColor: Colors.greenDim },
  aiCardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  aiCardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  aiCardCost: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  aiGoogleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start',
  },
  aiGoogleBtnText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },

  // Transport tab
  transportHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  transportBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  transportBadgeLabel: { fontSize: 12, fontWeight: '700' },
  transportChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  transportChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  aiAddBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  aiRegenerateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 12, marginTop: 6,
    backgroundColor: Colors.card,
  },
  aiRegenerateText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
});
