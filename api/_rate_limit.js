/**
 * 以 Supabase 資料表實作的固定時間窗速率限制（schema 見 supabase_schema.sql 第 8 節）。
 * 計數存在資料庫，所以多個 Serverless 容器共用同一份，不會因為換容器就歸零。
 */
import { getSupabase } from './_supabase.js';

/** 目前時間窗內的次數（時間窗已過期視為 0）。資料庫出錯時拋例外，由呼叫端決定 fail-open 或 fail-closed。 */
export async function rateLimitCount(key, windowSeconds) {
  const { data, error } = await getSupabase()
    .from('rate_limits')
    .select('count, window_start')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return 0;
  const age = Date.now() - new Date(data.window_start).getTime();
  return age > windowSeconds * 1000 ? 0 : data.count;
}

/** 計一次，回傳計入後的次數。 */
export async function rateLimitHit(key, windowSeconds) {
  const { data, error } = await getSupabase().rpc('rate_limit_hit', {
    p_key: key,
    p_window_seconds: windowSeconds
  });
  if (error) throw error;
  return data;
}

export async function rateLimitReset(key) {
  const { error } = await getSupabase().from('rate_limits').delete().eq('key', key);
  if (error) throw error;
}
