# TraderMonkeys

Persoonlijke AI trading assistant met nieuwsaggregatie, sentimentanalyse, signalen en brokerkoppeling.

## Tech stack

- **Frontend**: Next.js + TypeScript + Tailwind CSS, gehost op Vercel
- **Backend**: FastAPI (Python), gehost op Render
- **Database**: PostgreSQL + pgvector via Supabase
- **Auth**: Supabase Auth
- **Broker**: Trading 212 (demo/live)
- **LLM**: OpenRouter

## Projectstructuur

```
.
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # FastAPI backend
├── docker-compose.yml
├── .env.example
└── README.md
```

## Lokale ontwikkeling

### 1. Vereisten

- Docker Desktop
- Node.js 22+ (alleen als je Next.js buiten Docker wilt draaien)
- Python 3.12+ (alleen als je FastAPI buiten Docker wilt draaien)

### 2. Environment variables

Kopieer de voorbeeldbestanden:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Vul daarna je eigen keys in:

- **Supabase**: maak een project aan bij [Supabase](https://supabase.com), kopieer URL en anon/service keys.
- **Trading 212**: genereer een API key pair in je account (Settings → API Beta). Gebruik eerst **demo** keys.
- **OpenRouter**: maak een key aan bij [OpenRouter](https://openrouter.ai).

> ⚠️ **Belangrijk**: `.env` files staan in `.gitignore`. Deel je API keys nooit in code of commits.

### 3. Start de stack

```bash
docker compose up --build -d
```

Beschikbare services:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Database: localhost:5433 (PostgreSQL in container)

### 4. Test de API

```bash
curl http://localhost:8000/health
```

### 5. Trading 212 API activeren

Voordat de broker health check werkt, moet je in Trading 212:

1. Inloggen op je account
2. Ga naar **Settings → API (Beta)**
3. Accepteer de risico-waarschuwing
4. Genereer een API key + secret
5. (Optioneel) stel IP-restricties in

## Productfeatures

### Sprint 1 (huidig)

- [x] Next.js + Supabase auth setup
- [x] FastAPI backend met PostgreSQL
- [x] Docker Compose voor lokale ontwikkeling
- [x] Trading 212 broker client
- [x] Basis dashboard met health checks

### Sprint 2

- [ ] Portfolio sync van Trading 212
- [ ] Supabase realtime updates
- [ ] Dashboard met posities en orders

### Sprint 3

- [ ] Nieuws-ingestie (SEC, Euronext, RSS)
- [ ] Sentimentanalyse (FinBERT / XLM-R)
- [ ] OpenRouter event extractie

### Sprint 4

- [ ] Signal engine met BUY/SELL/STOP-loss
- [ ] Risk engine (ATR, Kelly sizing)
- [ ] Paper trading

### Sprint 5

- [ ] AI assistant chat
- [ ] Scanner / screener

### Sprint 6

- [ ] Backtest engine
- [ ] Audit logging
- [ ] Live mode optie

## Deployment

### Backend (Render)

1. Maak een nieuwe Web Service aan op [Render](https://render.com)
2. Koppel je GitHub repo
3. Root directory: `apps/api`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Voeg environment variables toe uit `apps/api/.env.example`

### Frontend (Vercel)

1. Importeer je repo op [Vercel](https://vercel.com)
2. Root directory: `apps/web`
3. Framework preset: Next.js
4. Voeg environment variables toe uit `apps/web/.env.example`

### Database (Supabase)

1. Maak een project aan
2. Voer eventueel Alembic migraties uit
3. Schakel Realtime in voor `positions` en `orders` tabellen

## Compliance & veiligheid

- De app genereert **signalen**, geen gepersonaliseerd beleggingsadvies.
- Elke order vereist expliciete user approval.
- Paper trading is de standaard modus.
- API keys worden nooit in code opgeslagen.
- Alle signalen en orders worden gelogd in `audit_logs`.

## License

Persoonlijk gebruik.
