-- Supabase schema for TraderMonkeys
-- Run this first in the Supabase SQL Editor if you get:
--   ERROR: 42P01: relation "public.xxx" does not exist
-- Then run supabase realtime.sql.

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid NOT NULL,
    user_id character varying NOT NULL,
    action character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying,
    payload json,
    created_at timestamp with time zone
);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON public.audit_logs USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.brokers (
    id uuid NOT NULL,
    user_id character varying NOT NULL,
    broker_name character varying NOT NULL,
    is_demo boolean,
    api_key_encrypted text,
    api_secret_encrypted text,
    is_active boolean,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_brokers_user_id ON public.brokers USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.news_items (
    id uuid NOT NULL,
    source character varying NOT NULL,
    source_class character varying NOT NULL,
    publisher character varying,
    title text NOT NULL,
    body text,
    language character varying,
    published_at timestamp with time zone,
    sentiment_score double precision,
    entities json,
    embedding json,
    url text,
    fetched_at timestamp with time zone
);

ALTER TABLE ONLY public.news_items
    ADD CONSTRAINT news_items_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_news_items_source_class ON public.news_items USING btree (source_class);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid NOT NULL,
    user_id character varying NOT NULL,
    broker_id uuid,
    broker_order_id character varying,
    symbol character varying NOT NULL,
    direction character varying NOT NULL,
    order_type character varying NOT NULL,
    quantity double precision NOT NULL,
    status character varying NOT NULL,
    filled_price double precision,
    limit_price double precision,
    stop_price double precision,
    time_validity character varying,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_orders_broker_id ON public.orders USING btree (broker_id);
CREATE INDEX IF NOT EXISTS ix_orders_broker_order_id ON public.orders USING btree (broker_order_id);
CREATE INDEX IF NOT EXISTS ix_orders_symbol ON public.orders USING btree (symbol);
CREATE INDEX IF NOT EXISTS ix_orders_user_id ON public.orders USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.positions (
    id uuid NOT NULL,
    user_id character varying NOT NULL,
    broker_id uuid NOT NULL,
    symbol character varying NOT NULL,
    quantity double precision NOT NULL,
    avg_price double precision NOT NULL,
    market_value double precision,
    unrealized_pnl double precision,
    realized_pnl double precision,
    currency character varying,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_positions_broker_id ON public.positions USING btree (broker_id);
CREATE INDEX IF NOT EXISTS ix_positions_symbol ON public.positions USING btree (symbol);
CREATE INDEX IF NOT EXISTS ix_positions_user_id ON public.positions USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.signals (
    id uuid NOT NULL,
    user_id character varying NOT NULL,
    symbol character varying NOT NULL,
    direction character varying,
    entry_type character varying,
    entry_price double precision,
    stop_loss double precision,
    take_profit_1 double precision,
    take_profit_2 double precision,
    quantity double precision,
    confidence double precision,
    status character varying NOT NULL,
    analysis_json json,
    generated_at timestamp with time zone,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone
);

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_signals_symbol ON public.signals USING btree (symbol);
CREATE INDEX IF NOT EXISTS ix_signals_user_id ON public.signals USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.market_bars (
    id uuid NOT NULL,
    symbol character varying NOT NULL,
    timeframe character varying NOT NULL,
    timestamp timestamp with time zone NOT NULL,
    open double precision NOT NULL,
    high double precision NOT NULL,
    low double precision NOT NULL,
    close double precision NOT NULL,
    volume double precision,
    created_at timestamp with time zone
);

ALTER TABLE ONLY public.market_bars
    ADD CONSTRAINT market_bars_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS ix_market_bars_symbol_timeframe ON public.market_bars USING btree (symbol, timeframe);
CREATE INDEX IF NOT EXISTS ix_market_bars_timestamp ON public.market_bars USING btree (timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_bars_unique ON public.market_bars (symbol, timeframe, timestamp);
