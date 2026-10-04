-- Powers the "did you mean...?" typeahead dropdown under the free-text
-- search box (Check Price's "Enter details" and the Search Items tab share
-- one component, FreeTextSearch) — as the shopper types a partial word that
-- matches several different registered products, this lets the UI show a
-- short list (with each product's own photo) so they can pick the exact
-- item before running the full search, instead of submitting a vague word
-- and hoping the AI parse lands on the right one.
--
-- Deliberately much lighter than search_nearby_products_by_text (0029):
-- this is about product IDENTITY ("which of these 5 things did you mean"),
-- not price comparison, so it skips distance/trust-badge/embedding
-- entirely and just returns distinct matching products, each with at least
-- one real (active store, in-stock, not hidden) listing somewhere —
-- otherwise it could suggest items nobody can actually buy, which would be
-- worse than no suggestion at all.
create or replace function search_product_suggestions(
  query_text text,
  match_limit integer default 8
)
returns table (
  product_id uuid,
  product_name text,
  brand text,
  size numeric,
  unit text,
  image_url text
) language sql stable as $$
  -- No join here (just an EXISTS subquery), so `products` rows are already
  -- unique by id going in — the ordering below is purely for RELEVANCE
  -- (best match first, so LIMIT keeps the right ones), not deduplication.
  select
    p.id as product_id,
    p.canonical_name as product_name,
    p.brand,
    p.size,
    p.unit,
    p.image_url
  from products p
  where length(trim(query_text)) >= 2
    and (
      p.canonical_name ilike '%' || query_text || '%'
      or (p.brand is not null and p.brand ilike '%' || query_text || '%')
    )
    and exists (
      select 1
      from store_inventory si
      join stores s on s.id = si.store_id
      where si.product_id = p.id
        and s.is_active
        and si.in_stock
        and not si.is_hidden
    )
  order by
    -- Name starting with the typed text ranks above a mid-string match
    -- (brand-only match ranks last) — "milk" should surface "Milk
    -- Chocolate..." before something that merely contains "milk" somewhere
    -- in the name.
    case
      when p.canonical_name ilike query_text || '%' then 0
      when p.canonical_name ilike '%' || query_text || '%' then 1
      else 2
    end,
    p.canonical_name
  limit match_limit;
$$;
