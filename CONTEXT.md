# Wayfarer — Contexto Completo do Projeto

> Gerado em: 2026-04-09 · Última atualização: 2026-04-09  
> Este ficheiro resume tudo o que foi construído neste projeto para não perder contexto.

---

## O que é o app

**Wayfarer** — app mobile de planeamento de viagens em grupo. Os utilizadores criam viagens, convidam amigos via código, planeiam destinos, votam em ideias, dividem o grupo em "splits" e acompanham tudo num workspace partilhado.

Stack: **Expo SDK 54 + Expo Router + React Native + Supabase + TypeScript**

---

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Expo SDK 54, Expo Router (file-based routing) |
| UI | React Native + React Native Web |
| Backend | Supabase (Postgres + Auth + Realtime + RLS) |
| Linguagem | TypeScript |
| Ícones | `@expo/vector-icons` (FontAwesome) |
| Animações | react-native-reanimated |

---

## Design System

```ts
Colors = {
  background:    '#F7F5F0',   // bege claro
  backgroundAlt: '#EEEAE2',
  card:          '#FFFFFF',
  border:        '#E4E0D8',
  primary:       '#E8622A',   // laranja — cor principal
  primaryDim:    '#E8622A18',
  success:       '#00A878',   // verde
  successDim:    '#00A87815',
  green:         '#22C55E',
  text:          '#1A1814',
  textSecondary: '#7A7570',
  textMuted:     '#B0ABA4',
  white:         '#FFFFFF',
}
```

---

## Estrutura de Ficheiros

```
app/
  _layout.tsx              # Root layout, auth check
  login.tsx                # Login com email/senha
  signup.tsx               # Cadastro
  onboarding.tsx           # Preferências do utilizador (multi-select)
  (tabs)/
    _layout.tsx            # Bottom tabs
    index.tsx              # Home: lista de viagens + notificações
    profile.tsx            # Perfil + preferências + viagens
  trip/[id].tsx            # Workspace da viagem (tabs + todos os features)
  create-trip.tsx          # Criar nova viagem
  create-split.tsx         # Criar split/sub-viagem
  join/[code].tsx          # Entrar numa viagem por código
  notifications.tsx        # Ecrã de notificações

components/
  CalendarPicker.tsx       # Seletor de datas estilo Google Flights
  CitySearchInput.tsx      # Autocomplete de cidades (Open-Meteo API)
  AirportSearchInput.tsx   # Autocomplete de aeroportos (OpenFlights dataset)
  AirlineSearchInput.tsx   # Autocomplete de companhias aéreas (OpenFlights)

lib/
  supabase.ts              # Cliente Supabase configurado
  colors.ts                # Design tokens
  types.ts                 # Todos os tipos TypeScript
  notifications.ts         # Helper createNotificationsForTrip()

supabase/
  schema.sql               # Schema base
  fix_rls.sql              # Corrige recursão infinita em RLS (is_trip_member())
  add_people_count.sql
  add_subtrips.sql
  add_delete_policy.sql
  add_comments.sql         # Comentários em ideias
  add_budget.sql           # Orçamento / despesas
  add_packing.sql          # Lista de embalagem
  add_notifications.sql    # Notificações in-app
  add_itinerary.sql        # Itinerário diário
  update_preferences.sql   # Converte travel_vibe/budget_range para text[]
```

---

## Base de Dados — Tabelas

### `profiles`
```sql
id, username, full_name, avatar_url,
travel_vibe text[],       -- multi-select: 'cultural','party','outdoors','mixed'
group_size_pref integer,
budget_range text[],      -- multi-select: 'budget','mid','luxury'
travel_frequency text,
onboarded boolean
```

### `trips`
```sql
id, name, created_by, invite_code, status,
cover_image text,         -- URL Unsplash auto-gerada
people_count integer,
parent_trip_id uuid,      -- NULL = viagem principal, preenchido = split
split_note text
```

### `trip_stops`
```sql
id, trip_id, destination, start_date, end_date, order_index
```

### `trip_members`
```sql
id, trip_id, user_id, display_name, role ('owner'|'member'), avatar_url, joined_at
```

### `trip_tabs`
```sql
id, trip_id, name, icon, order_index, created_by
-- Tabs padrão: Flights, Accommodation, Restaurants, Activities,
--              Nightlife, Transport, Budget, Packing, Documents
```

### `ideas`
```sql
id, tab_id, trip_id, created_by, creator_name, title, description,
url, estimated_cost, currency, status ('idea'|'confirmed'),
confirmed_at, vote_count, order_index
```

### `idea_votes`
```sql
id, idea_id, user_id, member_id
```

### `idea_comments`
```sql
id, idea_id, user_id, display_name, content, created_at
```

### `flights`
```sql
id, trip_id, stop_id, airline, flight_number,
departure_airport, arrival_airport,
departure_time, arrival_time, price, currency, added_by
```

### `trip_expenses`
```sql
id, trip_id, title, amount, currency,
paid_by_user_id, paid_by_name
```

### `packing_items`
```sql
id, trip_id, title, assigned_to_user_id, assigned_to_name,
checked, checked_by_name, created_by
```

### `notifications`
```sql
id, user_id, trip_id, type, message, trip_name, read
-- types: 'idea_added', 'idea_confirmed', 'comment_added', 'member_joined'
```

### `itinerary_items`
```sql
id, trip_id, date (YYYY-MM-DD), title, description,
time_start ('09:00'), category, idea_id, order_index, created_by
-- categories: 'transport','accommodation','food','activity','nightlife','other'
```

---

## RLS — Segurança

Todas as tabelas têm RLS ativa. A função central é:

```sql
create or replace function public.is_trip_member(trip_uuid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from trip_members
    where trip_id = trip_uuid and user_id = auth.uid()
  );
$$;
```

**Problema crítico resolvido:** recursão infinita em `trip_members` quando a policy SELECT usava `select from trip_members` dentro dela própria. Solução: `security definer` function.

**Race condition resolvida:** ao criar viagem/split, `trip_members` deve ser inserido ANTES de `trip_tabs` (que usa `is_trip_member()` no INSERT policy). Inserir em paralelo fazia os tabs silenciosamente falhar.

```tsx
// CORRETO — members primeiro, tabs depois
await supabase.from('trip_members').insert([...]);
await Promise.all([
  supabase.from('trip_stops').insert([...]),
  supabase.from('trip_tabs').insert([...]),
]);
```

---

## Features Implementadas

### Auth & Onboarding
- Login / signup com Supabase Auth
- Onboarding 3 passos: vibe (multi-select), group size, budget (multi-select)
- Checkboxes em vez de radio buttons — o utilizador pode selecionar múltiplas opções
- Redireciona automaticamente conforme estado de auth

### Home Screen (`app/(tabs)/index.tsx`)
- Lista de viagens do utilizador com cover photo
- Splits aparecem aninhados abaixo da viagem pai (compactos)
- `useFocusEffect` para refetch ao voltar ao tab
- Join trip via modal de código (compatível com web, sem `Alert.alert`)
- FAB para criar nova viagem
- Sino de notificações com badge de não lidas + realtime
- Tagline itálica no rodapé

### Workspace da Viagem (`app/trip/[id].tsx`)
Tabs padrão + 3 tabs virtuais especiais:

**Tabs regulares** (ideias + votação):
- Cada tab tem lista de ideias com votos, confirmação, e comments
- Votar → confirmar → desconfirmar
- Sistema de progresso (barra de votação)
- Realtime: qualquer mudança reflete imediatamente para todos os membros

**Tab Flights** (especial):
- Adicionar voos com autocomplete de aeroporto (IATA) e companhia aérea
- Mostra rota com IATA de partida/chegada, airline, número, preço

**Tab Budget** (especial):
- Resumo: total gasto + divisão por pessoa
- Lista de despesas com avatar colorido do pagador
- Modal de adicionar: título, valor, moeda (EUR/USD/GBP), quem pagou (member picker)

**Tab Packing** (especial):
- Barra de progresso X/Y embalados
- Input rápido inline para adicionar itens
- Duas secções: "Still needed" / "Packed ✓"
- Tap para marcar/desmarcar (com realtime)

**AI "Need help with your trip?"** (em todas as tabs de ideias):
- Botão flutuante "Need help with your trip?" acima do FAB "+ Add idea"
- Abre modal que chama `claude-haiku-4-5-20251001` via Anthropic API
- Contexto enviado ao AI: destino(s), datas, tamanho do grupo, vibe + budget do perfil, ideias já confirmadas, nome do tab atual
- Gera 5 sugestões específicas e contextuais (nomes reais, lugares concretos)
- Cada sugestão tem título, descrição e custo estimado (€) ou null
- Tap no `+` adiciona como ideia no tab atual, com checkmark após adicionar
- Botão "Generate new suggestions" para nova ronda
- Requer `EXPO_PUBLIC_ANTHROPIC_API_KEY` no ficheiro `.env`
- Usa `claude-haiku-4-5-20251001` (rápido, ~$0.001 por chamada)

**Tab Itinerary** (virtual `__itinerary__`):
- Apenas disponível se os stops tiverem datas
- Seletor de dias horizontal (strip com dia/mês, dot para hoje)
- Label do destino para cada dia
- Timeline vertical com itens: hora | card com borda colorida por categoria
- 6 categorias: Transport 🔵, Accommodation 🟣, Food 🟠, Activity 🟢, Nightlife 🩷, Other
- Modal "Add to day": título, categoria (chip grid), hora opcional, notas
- Modal "Import from ideas": seleciona ideias confirmadas e auto-adivinha categoria
- Realtime subscriptions

**Tab Map** (virtual `__map__`):
- Geocodifica stops + ideias confirmadas via Nominatim (OpenStreetMap)
- Web: iframe com Leaflet.js (dark theme, tiles CartoDB)
- Marcadores verdes = stops, laranja = ideias confirmadas
- Native: fallback com lista de stops

**Tab Splits** (virtual `__splits__`):
- Lista de sub-viagens (splits) da viagem
- FAB "Create a split" → `app/create-split.tsx`
- Cada split card mostra nome, nota, pessoas, status

**Header do workspace:**
- Nome da viagem + destinos no subtítulo
- Stats bar: membros, datas, dias para ir, status
- Botão de invite (só viagens principais)
- Menu (⋮): Editar, Apagar

**Editar viagem:**
- Nome, status (Planning/Confirmed/Completed)
- Stops com CitySearchInput + CalendarPicker
- Para splits: member picker em vez de "people going" (mostra membros do pai)

**Apagar viagem:**
- Modal de confirmação custom (sem `Alert.alert` — compatível com web)

**Splits / Sub-viagens:**
- Cada split é uma viagem com `parent_trip_id` preenchido
- Tem o seu próprio workspace completo
- Breadcrumb laranja "Split from X" no topo
- Não mostra tabs Splits/Map (só viagens raiz têm)
- Não tem botão de invite

### Criar Viagem (`app/create-trip.tsx`)
- Nome da viagem
- Multi-stop com CitySearchInput por stop
- CalendarPicker por stop
- Seletor de nº de pessoas (chips + input custom)
- Tabs a incluir (editável, com chips)
- Auto-fetch de cover photo Unsplash baseado no 1º destino
- Race condition fix: members antes de tabs

### Criar Split (`app/create-split.tsx`)
- Nome do split
- Member picker (membros da viagem pai)
- **Import from parent trip**: botão que copia todos os stops/datas da viagem pai
- Multi-stop suportado (mesma UX que create-trip)
- Nota opcional
- Race condition fix igual

### Comentários em Ideias
- Botão "comment-o" em cada idea card com contador
- Modal slide-up com lista de comentários
- Input no fundo para adicionar
- Realtime: comentários aparecem ao vivo

### Notificações
- Geradas automaticamente quando: ideia adicionada, ideia confirmada
- Bell icon na home com badge de não lidas
- Realtime: badge atualiza sem refresh
- Tap num item abre a viagem correspondente
- "Mark all read" ao abrir o modal

### Cover Photos
- Auto-gerada no momento de criar a viagem
- Fetch via Unsplash Source API (HEAD request para URL estável)
- Baseada no 1º destino da viagem
- Mostrada no card da home e no header do workspace

---

## Componentes Reutilizáveis

### `CitySearchInput`
- API: `geocoding-api.open-meteo.com` (grátis, sem API key)
- Filtra resultados com `population > 0` (elimina aldeias homónimas)
- Ordena por população (Tokyo antes de Tokyo, Kansas)
- Debounce 300ms
- `outline: 'none'` no web para remover focus ring azul do browser

### `AirportSearchInput`
- Dataset: `mwgg/Airports` JSON (GitHub, ~7k aeroportos com IATA)
- Cache em memória (fetch uma vez por sessão)
- Pesquisa por código IATA, cidade ou nome
- Scoring: match exato IATA > cidade > nome parcial
- Mostra: badge IATA | nome do aeroporto | cidade · país

### `AirlineSearchInput`
- Dataset: OpenFlights `airlines.dat` (CSV, ~6k companhias ativas)
- Parser CSV custom (campos com vírgulas dentro de aspas)
- Filtra `Active = 'Y'` e IATA code válido (2 letras)
- Cache em memória

### `CalendarPicker`
- Seletor de intervalo de datas estilo Google Flights
- Suporte `singleDate` mode
- Range strips (half-strip nos endpoints)
- Dot para hoje, datas passadas dimmed e não clicáveis
- Navegação mês anterior/próximo
- Summary bar com FROM/TO + badge "X nights"

---

## Compatibilidade Web

O app corre no browser via Expo Web. Coisas importantes:

- **Nunca usar `Alert.alert`** — é no-op na web. Usar Modal custom.
- **`outline: 'none'`** nos TextInputs para remover focus ring azul do browser
- **`Platform.OS === 'web'`** para condicionais de plataforma
- **Map tab**: usa `<iframe srcDoc={html}>` na web, fallback na native
- Todos os modais usam `animationType="slide"` e `presentationStyle="pageSheet"`

---

## APIs Externas Usadas

| API | Para quê | Auth |
|-----|----------|------|
| Open-Meteo Geocoding | Autocomplete de cidades | Nenhuma |
| Nominatim (OpenStreetMap) | Geocodificação para o mapa | Nenhuma |
| OpenFlights airports.dat | Dataset aeroportos | Nenhuma |
| OpenFlights airlines.dat | Dataset companhias aéreas | Nenhuma |
| mwgg/Airports JSON | Dataset aeroportos (alternativo) | Nenhuma |
| Unsplash Source API | Cover photos automáticas | Nenhuma |
| CartoDB / Leaflet | Tiles do mapa | Nenhuma |
| **Anthropic API** | **AI trip assistant** | **`EXPO_PUBLIC_ANTHROPIC_API_KEY`** |

### Configurar chave Anthropic
```bash
# .env
EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
```
Obter em: https://console.anthropic.com

---

## Migrações SQL Pendentes de Correr

Sempre que criar uma conta nova ou instalar fresh, correr por esta ordem no Supabase SQL Editor:

1. `fix_rls.sql` — CRÍTICO, corrige recursão em trip_members
2. `add_people_count.sql`
3. `add_subtrips.sql`
4. `add_delete_policy.sql`
5. `add_comments.sql`
6. `add_budget.sql`
7. `add_packing.sql`
8. `add_notifications.sql`
9. `add_itinerary.sql`
10. `update_preferences.sql` — converte travel_vibe e budget_range para `text[]`

---

## Partilhar o App

- **Durante dev**: `npx expo start --tunnel` → QR code acessível de qualquer país (Expo Go)
- **Deploy permanente**: `npx expo export -p web && vercel deploy dist`

---

## Features Pedidas mas Ainda Por Implementar

1. **Links de afiliado** — quando ideia tem URL de hotel/restaurante, converter para link de afiliado (Booking.com Partners, etc.) para monetização
2. **Chat por viagem** — mensagens em tempo real dentro de cada trip
3. **Divisão de contas** — quem deve o quê a quem (Splitwise integrado)
4. **Votação em datas** — tipo Doodle, cada membro marca fins de semana disponíveis
5. **Timeline cronológica** — visão de tudo confirmado num feed ordenado por data/hora
6. **Onboarding** — ecrãs animados explicativos para novos utilizadores
7. **Widget iOS/Android** — próxima viagem na home screen
8. **Partilhar itinerário** — gerar PDF/link bonito com tudo confirmado
9. **Modo "surpresa"** — esconder destino até data revelada

---

## Problemas Conhecidos Resolvidos

| Problema | Causa | Solução |
|----------|-------|---------|
| RLS infinite recursion | Policy SELECT em trip_members consultava a própria tabela | `security definer` function `is_trip_member()` |
| Tabs silenciosamente não criados | Race condition: tabs inseridos antes de members | Await members insert, depois tabs |
| FAB desaparecia após criar viagem | `useEffect([], [])` não re-executa em tab já montado | `useFocusEffect(useCallback(...))` |
| Delete trip não funcionava na web | `Alert.alert` é no-op na web | Modal custom de confirmação |
| Focus ring azul nos inputs (web) | Browser default `:focus` style | `outline: 'none'` na style prop |
| Ordenação de cidades por população | `orderby=population` não existe na API | Fetch 20 resultados, filtrar `population > 0`, sort client-side |
| SQL error `text[] = text` | `ALTER COLUMN TYPE` conflitua com policies existentes | Criar nova coluna, copiar dados, renomear |
| Split workspace vazio | Race condition igual à criação de viagem | Mesmo fix: members antes de tabs |
| Ordenação de aeroportos | Fetch cru retorna resultados desorganizados | Scoring: match IATA exato > cidade > nome parcial |
| CSV airlines com vírgulas dentro de aspas | `split(',')` simples quebra os campos | Parser CSV custom char-by-char com `inQuotes` flag |
| Preferências multi-select erro SQL | `ALTER COLUMN TYPE text[]` conflitua com RLS policies existentes | Criar coluna nova `text[]`, copiar dados, drop antiga, rename |

---

## Decisões de Arquitetura Importantes

### Tabs virtuais (não guardadas na BD)
As tabs `__itinerary__`, `__map__` e `__splits__` são objetos TypeScript criados em runtime — não existem na tabela `trip_tabs`. São adicionadas ao array `allTabs` apenas para viagens raiz (não splits). Identificadas pelo ID via constante (`ITINERARY_TAB_ID`, etc.).

### Cache de datasets grandes em memória JS
`AirportSearchInput` e `AirlineSearchInput` usam um módulo-level cache (`let _cache`, `let _promise`) para que os datasets (~7k aeroportos, ~6k companhias) sejam fetchados uma única vez por sessão e reutilizados. Pattern:
```ts
let _cache: Airport[] | null = null;
let _promise: Promise<Airport[]> | null = null;
async function loadAirports() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => { /* fetch + parse */ })();
  return _promise;
}
```

### AI assistant — estrutura do prompt
O prompt enviado ao Claude inclui: destino(s), datas, grupo, vibe/budget do perfil, ideias já confirmadas na viagem, e nome do tab. O modelo retorna JSON puro (sem markdown). O código extrai com regex `text.match(/\[[\s\S]*\]/)` para ser robusto a qualquer texto extra.

### `outline: 'none'` em TextInputs web
No React Native Web, os TextInputs têm um focus ring azul do browser por defeito. Para remover:
```tsx
style={[styles.input, Platform.OS === 'web' ? ({ outline: 'none' } as any) : null]}
```
Nunca passar como prop spread (`{...(Platform.OS === 'web' ? { outlineWidth: 0 } : {})}`), pois é ignorado pelo TextInput.

### Nominatim rate limit
A API Nominatim (OpenStreetMap) tem limite de 1 request/segundo. No MapTab, ao geocodificar múltiplas ideias, há `await new Promise(r => setTimeout(r, 1100))` entre cada request para não violar o rate limit.

### Unsplash cover photos sem API key
Usando `https://source.unsplash.com/featured/800x400/?${destino}` — retorna redirect para uma foto aleatória do destino. Fazemos um `fetch` com `HEAD` para obter o URL final (após redirect) e guardar o URL estático em `cover_image`.

---

## Variáveis de Ambiente

```bash
# .env (na raiz do projeto)
EXPO_PUBLIC_SUPABASE_URL=https://[projeto].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...   # Para o AI assistant (chave já configurada no .env)
```

Todas as variáveis com prefixo `EXPO_PUBLIC_` ficam disponíveis no cliente (browser/app). Nunca colocar secrets sem esse prefixo — não chegam ao bundle do cliente.

---

## Comandos Úteis

```bash
# Iniciar em dev (web)
npx expo start --web

# Iniciar com tunnel (acesso externo, Expo Go)
npx expo start --tunnel

# Build web estático
npx expo export -p web

# Deploy web (Vercel)
vercel deploy dist

# Verificar TypeScript
npx tsc --noEmit
```
