import { supabase } from "../lib/supabaseClient";

export async function fetchPortalRecord(portalToken) {
  const cleanedToken = String(portalToken || "").trim();

  if (!cleanedToken) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_portal_record", {
    p_portal_token: cleanedToken,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function markPortalItemReady(portalToken, itemId) {
  const cleanedToken = String(portalToken || "").trim();

  if (!cleanedToken || !itemId) {
    return null;
  }

  const { data, error } = await supabase.rpc(
    "portal_mark_checklist_item_ready",
    {
      p_portal_token: cleanedToken,
      p_item_id: itemId,
    }
  );

  if (error) {
    throw error;
  }

  return data;
}