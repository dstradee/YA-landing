// ==============================================================================
// YA - DEFINICIONES TYPESCRIPT: DROPS SEMANALES + SORTEO MENSUAL
// Archivo: src/types/drops.ts
// ==============================================================================

export type DropStatus = 'draft' | 'scheduled' | 'active' | 'finished' | 'cancelled';

export type DropGameType =
  | 'jackpot'
  | 'coin_flip'
  | 'cara_cruz'
  | 'trile'
  | 'scratch'
  | 'mystery_box'
  | 'wheel'
  | 'pick_one'
  | string; // Extensible para futuros juegos

export type DropActivationTrigger =
  | 'after_payment'
  | 'after_delivery'
  | 'after_buy'
  | 'manual'
  | 'code'
  | 'free'
  | string;

export type DropPrizeType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'free_order'
  | 'product'
  | 'pack'
  | 'credit'
  | 'monthly_draw_entry'
  | 'free_shipping'
  | 'custom';

export type UserPrizeStatus = 'pending' | 'used' | 'expired' | 'cancelled';

export type MonthlyDrawStatus = 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';

export type DropAttemptOutcome = 'won_prize' | 'consolation' | 'lost';

// ------------------------------------------------------------------------------
// MODELOS DE BASE DE DATOS
// ------------------------------------------------------------------------------

export interface DbDrop {
  id: string;
  drop_number: number;
  title: string;
  description: string | null;
  game_type: DropGameType;
  game_key?: string; // Identificador técnico estable del juego (abierto/extensible)
  status: DropStatus;
  starts_at: string;
  ends_at: string;
  activation_trigger: DropActivationTrigger;
  trigger_config: Record<string, any>;
  game_config: Record<string, any>;
  consolation_reward_type: 'monthly_draw_entry' | 'none' | 'custom';
  consolation_config: {
    entries_count?: number;
    [key: string]: any;
  };
  prize_validity_days: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDropPrize {
  id: string;
  drop_id: string;
  name: string;
  description: string | null;
  prize_type: DropPrizeType;
  prize_value: number;
  prize_config: Record<string, any>;
  probability_pct: number;
  max_inventory: number | null;
  inventory_consumed: number;
  validity_days: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbMonthlyDraw {
  id: string;
  month_identifier: string; // ej. '2026-10'
  title: string;
  description: string | null;
  theme_key: string; // 'standard', 'halloween', 'christmas', etc.
  theme_unit_name: string; // 'participación', 'telaraña', 'estrella'
  theme_unit_icon: string; // 'ticket', 'spiderweb', 'star', 'gift'
  prize_title: string;
  prize_description: string | null;
  prize_value: number;
  status: MonthlyDrawStatus;
  starts_at: string;
  ends_at: string;
  closed_at?: string | null;
  winner_user_id?: string | null;
  winner_notes?: string | null;
  awarded_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMonthlyDrawEntry {
  id: string;
  draw_id: string;
  user_id: string;
  source: 'drop' | 'order' | 'manual_admin' | 'promotion';
  drop_id?: string | null;
  order_id?: string | null;
  created_at: string;
}

export interface DbMonthlyDrawHistory {
  id: string;
  draw_id: string;
  month_identifier: string;
  draw_title: string;
  winner_user_id?: string | null;
  winner_name?: string | null;
  winner_email?: string | null;
  prize_title: string;
  prize_value: number;
  total_entries_count: number;
  total_unique_participants: number;
  awarded_at: string;
  notes?: string | null;
  created_at: string;
}

export interface DbUserAwardedPrize {
  id: string;
  user_id: string;
  drop_id: string;
  prize_id: string;
  prize_name: string;
  prize_type: DropPrizeType;
  prize_value: number;
  prize_config: Record<string, any>;
  status: UserPrizeStatus;
  awarded_at: string;
  expires_at: string;
  used_at?: string | null;
  used_in_order_id?: string | null;
  created_at: string;
}

export interface DbDropAttempt {
  id: string;
  drop_id: string;
  user_id: string;
  order_id?: string | null;
  idempotency_key?: string | null;
  outcome: DropAttemptOutcome;
  prize_id?: string | null;
  awarded_prize_id?: string | null;
  consolation_details?: Record<string, any> | null;
  created_at: string;
}

// ------------------------------------------------------------------------------
// RESPUESTAS Y MODELOS DE API / RPC
// ------------------------------------------------------------------------------

export interface ActiveDropPrize {
  id: string;
  name: string;
  description: string | null;
  prize_type: DropPrizeType;
  prize_value: number;
  prize_config: Record<string, any>;
  sort_order?: number;
}

export interface ActiveDropPayload {
  active: boolean;
  drop?: {
    id: string;
    drop_number: number;
    title: string;
    description: string | null;
    game_type: DropGameType;
    game_key?: string;
    activation_trigger: DropActivationTrigger;
    game_config: Record<string, any>;
    consolation_reward_type: string;
    consolation_config: {
      entries_count?: number;
      [key: string]: any;
    };
    starts_at: string;
    ends_at: string;
    prize_validity_days: number;
  };
  prizes?: ActiveDropPrize[];
  nextDrop?: {
    id: string;
    drop_number: number;
    title: string;
    description: string | null;
    game_type?: DropGameType;
    starts_at: string;
    ends_at: string;
  };
}

export interface CheckDropEligibilityResult {
  eligible: boolean;
  reason?: string;
  order_id?: string;
  trigger?: string;
  drop_id?: string;
  game_type?: DropGameType;
  game_key?: string;
  attempt_id?: string;
  outcome?: DropAttemptOutcome;
  prize_id?: string | null;
  awarded_prize_id?: string | null;
  prize?: any;
  consolation?: any;
}

export interface PlayDropResult {
  success: boolean;
  is_test_mode?: boolean;
  already_processed?: boolean;
  attempt_id: string;
  outcome: DropAttemptOutcome;
  prize_id?: string;
  awarded_prize_id?: string;
  consolation_entries?: number;
  message?: string;
  prize?: {
    id?: string;
    awarded_prize_id?: string;
    name: string;
    description: string | null;
    prize_type: DropPrizeType;
    prize_value: number;
    expires_at: string;
    validity_days?: number;
  };
  consolation?: {
    draw_id?: string;
    draw_title?: string;
    theme_unit_name?: string;
    theme_unit_icon?: string;
    entries_awarded?: number;
    note?: string;
  };
}

export interface ActiveMonthlyDrawPayload {
  active: boolean;
  draw?: {
    id: string;
    month_identifier: string;
    title: string;
    description: string | null;
    theme_key: string;
    theme_unit_name: string;
    theme_unit_icon: string;
    prize_title: string;
    prize_description: string | null;
    prize_value: number;
    starts_at: string;
    ends_at: string;
  };
  user_entries_count: number;
  total_entries_count: number;
}
