-- Cleanup duplicate campaigns: keep only the oldest by created_at, delete the rest
delete from public.campaigns
where id in (
  select id
  from (
    select
      id,
      row_number() over (partition by name order by created_at asc) as rn
    from public.campaigns
  ) ranked
  where rn > 1
);
