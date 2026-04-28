import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '@/lib/colors';

interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
}

// Module-level cache — fetched once per app session
let _cache: Airport[] | null = null;
let _promise: Promise<Airport[]> | null = null;

async function loadAirports(): Promise<Airport[]> {
  if (_cache) return _cache;
  if (_promise) return _promise;

  _promise = (async () => {
    const res = await fetch(
      'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json'
    );
    const raw: Record<string, any> = await res.json();
    const list: Airport[] = Object.values(raw)
      .filter(a => a.iata && a.iata.length === 3)
      .map(a => ({
        iata: a.iata as string,
        name: a.name as string,
        city: a.city as string,
        country: a.country as string,
      }));
    _cache = list;
    return list;
  })();

  return _promise;
}

function search(airports: Airport[], q: string): Airport[] {
  const lq = q.toLowerCase().trim();
  if (!lq) return [];

  const score = (a: Airport): number => {
    const iata = a.iata.toLowerCase();
    const city = a.city.toLowerCase();
    const name = a.name.toLowerCase();
    if (iata === lq) return 100;
    if (iata.startsWith(lq)) return 80;
    if (city === lq) return 70;
    if (city.startsWith(lq)) return 60;
    if (name.includes(lq)) return 40;
    if (city.includes(lq)) return 30;
    return 0;
  };

  return airports
    .map(a => ({ a, s: score(a) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 7)
    .map(x => x.a);
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function AirportSearchInput({ value, onChangeText, placeholder, autoFocus }: Props) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [results, setResults] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-load airport data as soon as component mounts
  useEffect(() => {
    loadAirports().then(setAirports).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);

    const q = value.trim();
    if (q.length < 1 || airports.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }

    // If already a selected IATA (3 uppercase letters), don't re-open
    if (/^[A-Z]{3}$/.test(value)) {
      setOpen(false);
      return;
    }

    setLoading(true);
    debounce.current = setTimeout(() => {
      setResults(search(airports, q));
      setOpen(true);
      setLoading(false);
    }, 150);

    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [value, airports]);

  function handleSelect(airport: Airport) {
    onChangeText(airport.iata);
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    onChangeText('');
    setResults([]);
    setOpen(false);
  }

  return (
    <View>
      <View style={styles.inputRow}>
        <FontAwesome name="plane" size={12} color={Colors.textMuted} />
        <TextInput
          style={[
            styles.input,
            Platform.OS === 'web' ? ({ outline: 'none' } as any) : null,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? 'Airport or city'}
          placeholderTextColor={Colors.textMuted}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={60}
        />
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
        {!loading && value.length > 0 && (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome name="times-circle" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {open && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((a, i) => (
            <TouchableOpacity
              key={a.iata + i}
              style={[styles.item, i < results.length - 1 && styles.itemDivider]}
              onPress={() => handleSelect(a)}
              activeOpacity={0.7}
            >
              <View style={styles.iataBox}>
                <Text style={styles.iataText}>{a.iata}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.airportName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.airportMeta} numberOfLines={1}>
                  {a.city}{a.city && a.country ? ' · ' : ''}{a.country}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 13, gap: 8,
  },
  input: {
    flex: 1, fontSize: 15, color: Colors.text, padding: 0,
    fontWeight: '600', letterSpacing: 0.5,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: Colors.card,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  iataBox: {
    width: 44, height: 32, borderRadius: 7,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  iataText: { fontSize: 13, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  airportName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  airportMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
});
