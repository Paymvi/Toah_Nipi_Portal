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


export async function unmarkPortalItemReady(portalToken, itemId) {
  const cleanedToken = String(portalToken || "").trim();

  if (!cleanedToken || !itemId) {
    return null;
  }

  const { data, error } = await supabase.rpc(
    "portal_unmark_checklist_item_ready",
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

/*
  Online signing (portal-sign Edge Function). The server re-checks the
  portal token, task and document on every call; this only carries the
  guest's entries. Errors come back as { error, code } with a message that
  is safe to show.
*/
export async function callPortalSign(body) {
  const { data, error } = await supabase.functions.invoke("portal-sign", { body });

  if (error) {
    // The function's { error, code } body, when the request reached it.
    const payload = await Promise.resolve(error.context?.json?.()).catch(() => null);

    const failure = new Error(
      payload?.error ||
      "Could not reach Toah Nipi's signing service. Check your connection and try again. If you already pressed Sign, trying again will not sign twice."
    );
    failure.code = payload?.code || "NETWORK";
    throw failure;
  }

  return data;
}
