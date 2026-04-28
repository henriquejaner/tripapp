import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '@/lib/colors';

interface Airline {
  iata: string;
  name: string;
  country: string;
}

// Module-level cache — loaded once per session
let _cache: Airline[] | null = null;
let _promise: Promise<Airline[]> | null = null;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

async function loadAirlines(): Promise<Airline[]> {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => {
    const res = await fetch(
      'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat'
    );
    const text = await res.text();
    const list: Airline[] = [];
    for (const line of text.split('\n')) {
      const p = parseCSVLine(line);
      if (p.length < 8) continue;
      const iata    = p[3];
      const name    = p[1];
      const country = p[6];
      const active  = p[7];
      if (!iata || iata === '\\N' || iata === '-' || iata.length !== 2) continue;
      if (active !== 'Y') continue;
      list.push({ iata, name, country });
    }
    _cache = list;
    return list;
  })();
  return _promise;
}

function search(airlines: Airline[], q: string): Airline[] {
  const lq = q.toLowerCase().trim();
  if (!lq) return [];

  const score = (a: Airline) => {
    const iata = a.iata.toLowerCase();
    const name = a.name.toLowerCase();
    if (iata === lq) return 100;
    if (iata.startsWith(lq)) return 80;
    if (name.startsWith(lq)) return 70;
    if (name.includes(lq)) return 50;
    return 0;
  };

  return airlines
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
}

export default function AirlineSearchInput({ value, onChangeText, placeholder }: Props) {
  const [airlines, setAirlines] = useState<Airline[]>([]);
  const [results, setResults] = useState<Airline[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadAirlines().then(setAirlines).catch(() => {}); }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = value.trim();
    if (q.length < 1 || airlines.length === 0) { setResults([]); setOpen(false); return; }
    setLoading(true);
    debounce.current = setTimeout(() => {
      setResults(search(airlines, q));
      setOpen(true);
      setLoading(false);
    }, 150);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [value, airlines]);

  function handleSelect(a: Airline) {
    onChangeText(a.name);
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
          placeholder={placeholder ?? 'Airline name or code'}
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
        {!loading && value.length > 0 && (
          <TouchableOpacity onPress={() => { onChangeText(''); setOpen(false); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome name="times-circle" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {open && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((a, i) => (
            <TouchableOpacity
              key={a.iata}
              style={[styles.item, i < results.length - 1 && styles.itemDivider]}
              onPress={() => handleSelect(a)}
              activeOpacity={0.7}
            >
              <View style={styles.iataBox}>
                <Text style={styles.iataText}>{a.iata}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.airlineName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.airlineMeta}>{a.country}</Text>
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
  input: { flex: 1, fontSize: 15, color: Colors.text, padding: 0 },
  dropdown: {
    marginTop: 4, backgroundColor: Colors.card,
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
    width: 36, height: 28, borderRadius: 6,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  iataText: { fontSize: 11, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  airlineName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  airlineMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
});
