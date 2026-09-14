// WooCommerce products proxy — reads credentials from nina_settings and proxies
// to the WC REST API. Used both by the frontend (for testing) and by the
// nina-orchestrator (search_products tool).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'list' | 'search' | 'by_category' | 'categories';

function stripHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function relevanceScore(product: any, search?: string): number {
  if (!search) return 1;
  const queryWords = normalizeSearchText(search).split(' ').filter((word) => word.length >= 3);
  if (queryWords.length === 0) return 0;
  const name = normalizeSearchText(product.name || '');
  const supporting = normalizeSearchText([
    product.short_description,
    ...(product.categories || []).map((item: any) => item.name),
    ...(product.tags || []).map((item: any) => item.name),
  ].filter(Boolean).join(' '));
  const matched = queryWords.filter((word) => name.includes(word) || supporting.includes(word));
  const nameMatched = queryWords.filter((word) => name.includes(word));
  return Number(Math.min(1, (nameMatched.length * 0.75 + (matched.length - nameMatched.length) * 0.25) / queryWords.length).toFixed(4));
}

function formatProduct(p: any, search?: string) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    regular_price: p.regular_price,
    sale_price: p.sale_price,
    on_sale: p.on_sale,
    stock: p.stock_status,
    stock_quantity: p.stock_quantity,
    purchasable: p.purchasable,
    type: p.type,
    categories: (p.categories || []).map((c: any) => c.name),
    short_desc: stripHtml(p.short_description),
    description: stripHtml(p.description),
    tags: (p.tags || []).map((t: any) => t.name),
    attributes: (p.attributes || []).map((a: any) => ({ name: a.name, options: a.options || [] })),
    variations: p.variations || [],
    image: p.images?.[0]?.src || null,
    url: p.permalink,
    relevance: relevanceScore(p, search),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'list') as Action;
    const search: string | undefined = body.search;
    const category: string | undefined = body.category;
    const limit: number = Math.min(Math.max(Number(body.limit) || 20, 1), 50);

    // Triple-fallback to find credentials (same pattern as wc-receiver)
    let credRow: any = null;
    const { data: g } = await supabase
      .from('nina_settings')
      .select('wc_site_url, wc_consumer_key, wc_consumer_secret')
      .is('user_id', null)
      .maybeSingle();
    credRow = g;
    if (!credRow?.wc_site_url || !credRow?.wc_consumer_key || !credRow?.wc_consumer_secret) {
      const { data: any1 } = await supabase
        .from('nina_settings')
        .select('wc_site_url, wc_consumer_key, wc_consumer_secret')
        .not('wc_consumer_key', 'is', null)
        .limit(1)
        .maybeSingle();
      credRow = any1;
    }

    const siteUrl = credRow?.wc_site_url?.replace(/\/$/, '');
    const ck = credRow?.wc_consumer_key;
    const cs = credRow?.wc_consumer_secret;

    if (!siteUrl || !ck || !cs) {
      return new Response(
        JSON.stringify({ success: false, error: 'WooCommerce não configurado. Preencha URL, Consumer Key e Consumer Secret em Configurações → APIs.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let endpoint = '';
    switch (action) {
      case 'list':
        endpoint = `${siteUrl}/wp-json/wc/v3/products?per_page=${limit}&status=publish`;
        break;
      case 'search':
        if (!search) {
          return new Response(JSON.stringify({ success: false, error: 'search é obrigatório para action=search' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        endpoint = `${siteUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(search)}&per_page=${limit}&status=publish`;
        break;
      case 'by_category':
        if (!category) {
          return new Response(JSON.stringify({ success: false, error: 'category é obrigatório para action=by_category' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        endpoint = `${siteUrl}/wp-json/wc/v3/products?category=${encodeURIComponent(category)}&per_page=${limit}&status=publish`;
        break;
      case 'categories':
        endpoint = `${siteUrl}/wp-json/wc/v3/products/categories?per_page=100`;
        break;
      default:
        return new Response(JSON.stringify({ success: false, error: `Ação inválida: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const auth = btoa(`${ck}:${cs}`);
    const wcRes = await fetch(endpoint, { headers: { Authorization: `Basic ${auth}` } });
    if (!wcRes.ok) {
      const errTxt = await wcRes.text().catch(() => '');
      console.error('[wc-products] WooCommerce error:', wcRes.status, errTxt.slice(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: `WooCommerce respondeu ${wcRes.status}`, detail: errTxt.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const raw = await wcRes.json();
    const data = action === 'categories'
      ? (raw as any[]).map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }))
      : (raw as any[])
          .map((product) => formatProduct(product, action === 'search' ? search : undefined))
          .sort((a, b) => b.relevance - a.relevance);

    return new Response(JSON.stringify({ success: true, count: data.length, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[wc-products] error:', e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
