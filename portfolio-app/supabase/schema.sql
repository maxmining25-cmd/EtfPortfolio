-- Supabase Schema Setup Script
-- AuraWealth Premium Portfolio Backtesting & Optimization Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users & Settings Table (linked to Supabase Auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT UNIQUE NOT NULL,
  telegram_chat_id  TEXT,
  risk_free_rate    NUMERIC DEFAULT 0.04,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own user record" 
  ON public.users FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own user record" 
  ON public.users FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Portfolios Table
CREATE TABLE IF NOT EXISTS public.portfolios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  rebalance_type      TEXT CHECK (rebalance_type IN ('none', 'monthly', 'quarterly', 'annually', 'deviation')) DEFAULT 'none',
  deviation_threshold NUMERIC DEFAULT 5.0,
  benchmark_ticker    TEXT DEFAULT 'SPY',
  telegram_enabled    BOOLEAN DEFAULT false,
  telegram_send_time  TIME DEFAULT '09:00:00',
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for portfolios
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own portfolios" 
  ON public.portfolios FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Portfolio Assets Table
CREATE TABLE IF NOT EXISTS public.portfolio_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  ticker       TEXT NOT NULL,
  weight       NUMERIC NOT NULL CHECK (weight > 0 AND weight <= 1.0),
  asset_type   TEXT CHECK (asset_type IN ('etf', 'crypto', 'metal')),
  UNIQUE (portfolio_id, ticker)
);

-- Enable RLS for portfolio_assets
ALTER TABLE public.portfolio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage portfolio assets" 
  ON public.portfolio_assets FOR ALL 
  USING (
    portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = auth.uid())
  );

-- 4. EOD Quotes Table
CREATE TABLE IF NOT EXISTS public.quotes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker    TEXT NOT NULL,
  date      DATE NOT NULL,
  adj_close NUMERIC NOT NULL,
  volume    BIGINT,
  UNIQUE (ticker, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_ticker_date ON public.quotes (ticker, date ASC);

-- Enable RLS for quotes
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select quotes" 
  ON public.quotes FOR SELECT 
  TO authenticated, anon 
  USING (true);

CREATE POLICY "Service role can manage quotes" 
  ON public.quotes FOR ALL 
  TO service_role 
  USING (true)
  WITH CHECK (true);

-- 5. System Import Log Table
CREATE TABLE IF NOT EXISTS public.import_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT CHECK (status IN ('success', 'error', 'skipped')),
  rows_imported INTEGER DEFAULT 0,
  error_message TEXT,
  reason        TEXT
);

-- Enable RLS for import_log
ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select import logs" 
  ON public.import_log FOR SELECT 
  TO authenticated, anon 
  USING (true);

CREATE POLICY "Service role can manage import logs" 
  ON public.import_log FOR ALL 
  TO service_role 
  USING (true)
  WITH CHECK (true);

-- 6. Trigger to automatically link auth.users to public.users on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
