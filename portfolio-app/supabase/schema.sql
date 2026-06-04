-- Supabase Schema Setup Script
-- AuraWealth Premium Portfolio Backtesting & Optimization Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

---- 1. Users & Settings Table (linked to Supabase Auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT UNIQUE NOT NULL,
  telegram_chat_id  TEXT,
  risk_free_rate    NUMERIC DEFAULT 0.04,
  is_admin          BOOLEAN DEFAULT false,
  is_locked         BOOLEAN DEFAULT false,
  theme             TEXT CHECK (theme IN ('dark', 'light')) DEFAULT 'dark',
  font_size         TEXT CHECK (font_size IN ('sm', 'base', 'lg', 'xl')) DEFAULT 'base',
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

-- Enable RLS for portfolios (block if user is locked)
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own portfolios" 
  ON public.portfolios FOR ALL 
  USING (
    auth.uid() = user_id 
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_locked = false)
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_locked = false)
  );

-- 3. Portfolio Assets Table
CREATE TABLE IF NOT EXISTS public.portfolio_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  ticker       TEXT NOT NULL,
  weight       NUMERIC NOT NULL CHECK (weight > 0 AND weight <= 1.0),
  asset_type   TEXT CHECK (asset_type IN ('etf', 'crypto', 'metal')),
  UNIQUE (portfolio_id, ticker)
);

-- Enable RLS for portfolio_assets (block if user is locked)
ALTER TABLE public.portfolio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage portfolio assets" 
  ON public.portfolio_assets FOR ALL 
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios 
      WHERE user_id = auth.uid() 
      AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_locked = false)
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM public.portfolios 
      WHERE user_id = auth.uid() 
      AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_locked = false)
    )
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
DECLARE
  is_first_user BOOLEAN;
BEGIN
  -- Designate the first user in public.users as Admin automatically
  SELECT count(*) = 0 INTO is_first_user FROM public.users;
  
  INSERT INTO public.users (id, email, is_admin)
  VALUES (new.id, new.email, is_first_user);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Security Definer RPC functions for Admin actions

-- Fetch all users for Admin
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  telegram_chat_id TEXT,
  risk_free_rate NUMERIC,
  is_admin BOOLEAN,
  is_locked BOOLEAN,
  theme TEXT,
  font_size TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Verify caller is an administrator
  IF EXISTS (SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.is_admin = true) THEN
    RETURN QUERY SELECT u.id, u.email, u.telegram_chat_id, u.risk_free_rate, u.is_admin, u.is_locked, u.theme, u.font_size, u.created_at FROM public.users u;
  ELSE
    RAISE EXCEPTION 'Access Denied: Only administrators can query user profiles.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update user settings by Admin
CREATE OR REPLACE FUNCTION public.admin_update_user(
  target_user_id UUID,
  new_is_admin BOOLEAN,
  new_is_locked BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  -- Verify caller is an administrator
  IF EXISTS (SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.is_admin = true) THEN
    -- Prevent an admin from locking themselves (failsafe)
    IF target_user_id = auth.uid() AND new_is_locked = true THEN
      RAISE EXCEPTION 'Failsafe: You cannot lock your own administrator account.';
    END IF;
    
    UPDATE public.users
    SET is_admin = new_is_admin, is_locked = new_is_locked
    WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Access Denied: Only administrators can modify user records.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
