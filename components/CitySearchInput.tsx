import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '@/lib/colors';

interface CityResult {
  id: number;
  name: string;
  country: string;
  admin1?: string; // state / region — shown for disambiguation
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputStyle?: object;
}

export default function CitySearchInput({
  value, onChangeText, placeholder, autoFocus, inputStyle,
}: Props) {
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);

    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=20&language=en&format=json`
        );
        const json = await res.json();
        const all: any[] = json.results ?? [];

        // Drop results with no population data — these are tiny unnamed hamlets
        // that share a name (e.g. "Japan" in Montenegro or Indonesia).
        // Fall back to the full list only if nothing has population at all,
        // so obscure-but-valid village searches still return something.
        const withPop = all.filter(r => r.population && r.population > 0);
        const pool = withPop.length > 0 ? withPop : all;

        const sorted = [...pool].sort(
          (a, b) => (b.population ?? 0) - (a.population ?? 0)
        );
        setResults(sorted.slice(0, 8));
        setOpen(true);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);

    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [value]);

  function handleSelect(city: CityResult) {
    onChangeText(`${city.name}, ${city.country}`);
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
      {/* Input row */}
      <View style={styles.inputRow}>
        <FontAwesome name="map-marker" size={14} color={Colors.textMuted} style={styles.mapIcon} />
        <TextInput
          style={[
            styles.input,
            inputStyle,
            // Remove browser default blue focus ring on web
            Platform.OS === 'web' ? ({ outline: 'none' } as any) : null,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? 'City or place'}
          placeholderTextColor={Colors.textMuted}
          autoFocus={autoFocus}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {loading && (
          <ActivityIndicator size="small" color={Colors.primary} style={styles.spinner} />
        )}
        {!loading && value.length > 0 && (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome name="times-circle" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions dropdown */}
      {open && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((city, i) => (
            <TouchableOpacity
              key={city.id}
              style={[styles.item, i < results.length - 1 && styles.itemDivider]}
              onPress={() => handleSelect(city)}
              activeOpacity={0.7}
            >
              <FontAwesome name="map-marker" size={12} color={Colors.textMuted} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cityName}>{city.name}</Text>
                <Text style={styles.cityMeta} numberOfLines={1}>
                  {city.admin1 ? `${city.admin1} · ` : ''}{city.country}
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
  mapIcon: { flexShrink: 0 },
  input: {
    flex: 1, fontSize: 15, color: Colors.text, padding: 0,
  },
  spinner: { flexShrink: 0 },

  dropdown: {
    marginTop: 4,
    backgroundColor: Colors.card,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  cityName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  cityMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
});
