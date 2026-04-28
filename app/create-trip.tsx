import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import CalendarPicker from '@/components/CalendarPicker';
import CitySearchInput from '@/components/CitySearchInput';

interface Stop {
  destination: string;
  start_date: string | null;
  end_date: string | null;
}

interface Tab {
  name: string;
}

const DEFAULT_TABS: Tab[] = [
  { name: 'Flights' },
  { name: 'Accommodation' },
  { name: 'Restaurants' },
  { name: 'Activities' },
  { name: 'Nightlife' },
  { name: 'Transport' },
  { name: 'Budget' },
  { name: 'Packing' },
  { name: 'Documents' },
];

const TAB_ICONS: Record<string, string> = {
  Flights: 'plane', Accommodation: 'home', Restaurants: 'cutlery',
  Activities: 'star-o', Nightlife: 'glass', Transport: 'car',
  Budget: 'money', Packing: 'suitcase', Documents: 'file-text-o',
};

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function calcNights(start: string, end: string): number {
  return Math.round(
    (new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000
  );
}

export default function CreateTripScreen() {
  const [name, setName] = useState('');
  const [stops, setStops] = useState<Stop[]>([{ destination: '', start_date: null, end_date: null }]);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [peopleText, setPeopleText] = useState('');
  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [newTabName, setNewTabName] = useState('');
  const [showAddTab, setShowAddTab] = useState(false);
  const [calendarFor, setCalendarFor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addStop() {
    setStops([...stops, { destination: '', start_date: null, end_date: null }]);
  }

  function removeStop(index: number) {
    if (stops.length === 1) return;
    setStops(stops.filter((_, i) => i !== index));
  }

  function updateDestination(index: number, value: string) {
    setStops(stops.map((s, i) => i === index ? { ...s, destination: value } : s));
  }

  function updateDates(index: number, start: string | null, end: string | null) {
    setStops(stops.map((s, i) => i === index ? { ...s, start_date: start, end_date: end } : s));
  }

  function removeTab(name: string) {
    setTabs(tabs.filter(t => t.name !== name));
  }

  function addCustomTab() {
    const trimmed = newTabName.trim();
    if (!trimmed) return;
    if (tabs.find(t => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    setTabs([...tabs, { name: trimmed }]);
    setNewTabName('');
    setShowAddTab(false);
  }

  async function handleCreate() {
    setError('');
    if (!name.trim()) { setError('Give your trip a name.'); return; }
    const filledStops = stops.filter(s => s.destination.trim());
    if (!filledStops.length) { setError('Add at least one destination.'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const inviteCode = generateInviteCode();
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({ name: name.trim(), created_by: user.id, invite_code: inviteCode, status: 'planning', people_count: peopleCount ?? null })
      .select()
      .single();

    if (tripError || !trip) {
      setLoading(false);
      setError(tripError?.message ?? 'Could not create trip.');
      return;
    }

    // Members first — tabs RLS checks is_trip_member(), must be committed before tabs insert
    await supabase.from('trip_members').insert({
      trip_id: trip.id,
      user_id: user.id,
      display_name: user.user_metadata?.full_name ?? 'You',
      role: 'owner',
    });

    await Promise.all([
      supabase.from('trip_stops').insert(
        filledStops.map((s, i) => ({
          trip_id: trip.id,
          destination: s.destination.trim(),
          start_date: s.start_date ?? null,
          end_date: s.end_date ?? null,
          order_index: i,
        }))
      ),
      supabase.from('trip_tabs').insert(
        tabs.map((t, i) => ({
          trip_id: trip.id,
          name: t.name,
          icon: TAB_ICONS[t.name] ?? 'bookmark-o',
          order_index: i,
          created_by: user.id,
        }))
      ),
    ]);

    // Auto-cover after everything else is saved
    const dest = stops[0]?.destination?.split(',')[0]?.trim();
    if (dest) {
      try {
        const imgRes = await fetch(
          `https://source.unsplash.com/800x600/?${encodeURIComponent(dest)},travel,city`,
          { method: 'HEAD' }
        );
        if (imgRes.url && imgRes.url.includes('unsplash.com')) {
          await supabase.from('trips').update({ cover_image: imgRes.url }).eq('id', trip.id);
        }
      } catch {}
    }

    setLoading(false);
    router.replace(`/trip/${trip.id}`);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New trip</Text>
          <View style={{ width: 56 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.inner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trip name */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Trip name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Summer in Portugal"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={v => setName(capitalizeWords(v))}
              returnKeyType="next"
              autoFocus
            />
          </View>

          {/* People */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>How many people?</Text>
            <View style={styles.peopleRow}>
              {[2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.peopleChip, peopleCount === n && styles.peopleChipActive]}
                  onPress={() => {
                    setPeopleCount(peopleCount === n ? null : n);
                    setPeopleText(peopleCount === n ? '' : String(n));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.peopleChipText, peopleCount === n && styles.peopleChipTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.peopleCustomRow}>
              <Text style={styles.peopleCustomLabel}>Or type a number:</Text>
              <TextInput
                style={styles.peopleCustomInput}
                placeholder="e.g. 20"
                placeholderTextColor={Colors.textMuted}
                value={peopleText}
                onChangeText={v => {
                  const digits = v.replace(/\D/g, '');
                  setPeopleText(digits);
                  const n = parseInt(digits, 10);
                  setPeopleCount(digits ? n : null);
                }}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>

          {/* Destinations */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Destinations</Text>
            <Text style={styles.sectionHint}>Add each city as a separate stop.</Text>

            {stops.map((stop, index) => (
              <View key={index} style={styles.stopCard}>
                <View style={styles.stopTop}>
                  <View style={styles.stopNumber}>
                    <Text style={styles.stopNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stopLabel}>Stop {index + 1}</Text>
                  {stops.length > 1 && (
                    <TouchableOpacity onPress={() => removeStop(index)} style={styles.removeBtn}>
                      <FontAwesome name="times" size={13} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <CitySearchInput
                  value={stop.destination}
                  onChangeText={v => updateDestination(index, v)}
                  placeholder="City or place"
                />

                {/* Date picker button */}
                <TouchableOpacity
                  style={styles.dateBtn}
                  onPress={() => setCalendarFor(index)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="calendar-o" size={13} color={Colors.textSecondary} />
                  {stop.start_date ? (
                    <View style={styles.dateBtnContent}>
                      <Text style={styles.dateBtnSelected}>
                        {formatDateShort(stop.start_date)}
                        {stop.end_date ? ` → ${formatDateShort(stop.end_date)}` : ''}
                      </Text>
                      {stop.start_date && stop.end_date && (
                        <Text style={styles.dateBtnNights}>
                          {calcNights(stop.start_date, stop.end_date)} nights
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.dateBtnPlaceholder}>Select dates</Text>
                  )}
                  <FontAwesome name="angle-right" size={13} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addStopBtn} onPress={addStop} activeOpacity={0.7}>
              <Text style={styles.addStopText}>+ Add another stop</Text>
            </TouchableOpacity>
          </View>

          {/* Planning tabs */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Planning tabs</Text>
            <Text style={styles.sectionHint}>Tap to remove. Add your own below.</Text>
            <View style={styles.tabsRow}>
              {tabs.map(t => (
                <TouchableOpacity
                  key={t.name}
                  style={styles.tabChip}
                  onPress={() => removeTab(t.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.tabChipText}>{t.name}</Text>
                  <FontAwesome name="times" size={10} color={Colors.textMuted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>

            {showAddTab ? (
              <View style={styles.addTabRow}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingVertical: 10 }]}
                  placeholder="Tab name"
                  placeholderTextColor={Colors.textMuted}
                  value={newTabName}
                  onChangeText={setNewTabName}
                  autoFocus
                  onSubmitEditing={addCustomTab}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.addTabConfirm} onPress={addCustomTab} activeOpacity={0.8}>
                  <Text style={styles.addTabConfirmText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddTab(false); setNewTabName(''); }} style={{ padding: 8 }}>
                  <FontAwesome name="times" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addStopBtn} onPress={() => setShowAddTab(true)} activeOpacity={0.7}>
                <Text style={styles.addStopText}>+ Add a tab</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.createBtn, loading && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.createBtnText}>{loading ? 'Creating...' : 'Create trip'}</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar picker */}
        <CalendarPicker
          visible={calendarFor !== null}
          startDate={calendarFor !== null ? stops[calendarFor]?.start_date ?? null : null}
          endDate={calendarFor !== null ? stops[calendarFor]?.end_date ?? null : null}
          title="Select dates"
          onClose={() => setCalendarFor(null)}
          onConfirm={(start, end) => {
            if (calendarFor !== null) updateDates(calendarFor, start, end);
            setCalendarFor(null);
          }}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelText: { fontSize: 15, color: Colors.textSecondary, width: 56 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, letterSpacing: -0.2 },

  inner: { padding: 24, paddingBottom: 120, gap: 32 },

  section: { gap: 10 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  sectionHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginTop: -4 },

  input: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.text,
  },

  // People picker
  peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  peopleChip: {
    width: 52, height: 44, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  peopleChipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  peopleChipText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  peopleChipTextActive: { color: Colors.white },
  peopleCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  peopleCustomLabel: { fontSize: 13, color: Colors.textSecondary },
  peopleCustomInput: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text, width: 90, textAlign: 'center',
  },

  // Stop card
  stopCard: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10,
  },
  stopTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stopNumberText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  stopLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  stopInput: { flex: 1 },
  removeBtn: { padding: 6 },

  // Date picker button
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: Colors.backgroundAlt,
  },
  dateBtnContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtnSelected: { fontSize: 14, fontWeight: '600', color: Colors.text },
  dateBtnNights: {
    fontSize: 11, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primaryDim, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  dateBtnPlaceholder: { fontSize: 14, color: Colors.textMuted, flex: 1 },

  addStopBtn: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  addStopText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },

  // Tabs
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tabChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  tabChipText: { fontSize: 13, color: Colors.textSecondary },
  addTabRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addTabConfirm: {
    backgroundColor: Colors.text, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  addTabConfirmText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 36,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 10,
  },
  errorText: { fontSize: 13, color: '#E53E3E', textAlign: 'center' },
  createBtn: {
    backgroundColor: Colors.text, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white, letterSpacing: 0.2 },
});
