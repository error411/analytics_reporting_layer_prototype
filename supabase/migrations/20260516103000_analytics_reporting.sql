create extension if not exists pgcrypto;

create table if not exists public.articles (
  id text primary key,
  title text not null,
  category text not null,
  slug text not null
);

create table if not exists public.ga_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'simulated-ga-api',
  imported_at timestamptz not null default now(),
  article_rows integer not null default 0,
  engagement_rows integer not null default 0
);

create table if not exists public.ga_daily_engagement (
  id text primary key,
  article_id text not null references public.articles(id) on delete cascade,
  date date not null,
  views integer not null check (views >= 0),
  engagement_score numeric(5, 2) not null check (engagement_score >= 0),
  country text not null,
  source text not null,
  imported_at timestamptz not null,
  unique (article_id, date, country, source)
);

create index if not exists ga_daily_engagement_date_idx
  on public.ga_daily_engagement (date);

create index if not exists ga_daily_engagement_article_date_idx
  on public.ga_daily_engagement (article_id, date);

create or replace function public.build_reporting_report(
  p_category text default 'All',
  p_article_id text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_group_by text default 'date'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_category text := coalesce(nullif(p_category, ''), 'All');
  v_article_id text := nullif(p_article_id, '');
  v_group_by text := case
    when p_group_by in ('date', 'source', 'country') then p_group_by
    else 'date'
  end;
  v_start_date date;
  v_end_date date;
  v_article_rows integer;
  v_engagement_rows integer;
  v_last_import public.ga_import_runs%rowtype;
begin
  select min(date), max(date)
  into v_start_date, v_end_date
  from public.ga_daily_engagement;

  v_start_date := coalesce(p_start_date, v_start_date);
  v_end_date := coalesce(p_end_date, v_end_date);

  select count(*) into v_article_rows from public.articles;
  select count(*) into v_engagement_rows from public.ga_daily_engagement;

  select *
  into v_last_import
  from public.ga_import_runs
  order by imported_at desc
  limit 1;

  return (
    with filtered_records as (
      select
        gde.id,
        gde.article_id,
        gde.date,
        gde.views,
        gde.engagement_score,
        gde.country,
        gde.source,
        a.title,
        a.category,
        a.slug
      from public.ga_daily_engagement gde
      join public.articles a on a.id = gde.article_id
      where (v_category = 'All' or a.category = v_category)
        and (v_article_id is null or gde.article_id = v_article_id)
        and (v_start_date is null or gde.date >= v_start_date)
        and (v_end_date is null or gde.date <= v_end_date)
    ),
    grouped as (
      select
        case v_group_by
          when 'source' then source
          when 'country' then country
          else date::text
        end as label,
        sum(views)::integer as views,
        round(avg(engagement_score), 1)::numeric as average_engagement_score,
        count(*)::integer as record_count
      from filtered_records
      group by label
    ),
    top_articles as (
      select
        article_id,
        max(title) as title,
        max(category) as category,
        max(slug) as slug,
        sum(views)::integer as views,
        round(avg(engagement_score), 1)::numeric as average_engagement_score
      from filtered_records
      group by article_id
      order by views desc
      limit 5
    ),
    daily_views as (
      select date, sum(views)::integer as views
      from filtered_records
      group by date
      order by date
    ),
    forecast_basis as (
      select date, views
      from daily_views
      order by date desc
      limit 3
    ),
    forecast_average as (
      select
        max(date) as final_date,
        round(avg(views))::integer as forecast_views
      from forecast_basis
    ),
    forecast as (
      select
        (final_date + forecast_offset)::text as date,
        forecast_views
      from forecast_average
      cross join generate_series(1, 3) as forecast_offset
      where final_date is not null and forecast_views > 0
    )
    select jsonb_build_object(
      'filters', jsonb_build_object(
        'articleId', coalesce(v_article_id, ''),
        'category', v_category,
        'startDate', coalesce(v_start_date::text, ''),
        'endDate', coalesce(v_end_date::text, ''),
        'groupBy', v_group_by
      ),
      'categories', coalesce(
        (select jsonb_agg(category order by category) from (select distinct category from public.articles) c),
        '[]'::jsonb
      ),
      'totals', jsonb_build_object(
        'views', coalesce((select sum(views)::integer from filtered_records), 0),
        'averageEngagementScore', coalesce((select round(avg(engagement_score), 1)::numeric from filtered_records), 0),
        'articleCount', coalesce((select count(distinct article_id)::integer from filtered_records), 0)
      ),
      'results', coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'label', label,
            'views', views,
            'averageEngagementScore', average_engagement_score,
            'recordCount', record_count
          )
          order by label
        ) from grouped),
        '[]'::jsonb
      ),
      'topArticles', coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'articleId', article_id,
            'title', title,
            'category', category,
            'slug', slug,
            'views', views,
            'averageEngagementScore', average_engagement_score
          )
          order by views desc
        ) from top_articles),
        '[]'::jsonb
      ),
      'forecast', case
        when v_group_by = 'date' then coalesce(
          (select jsonb_agg(
            jsonb_build_object(
              'date', date,
              'forecastViews', forecast_views
            )
            order by date
          ) from forecast),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end,
      'dataSource', jsonb_build_object(
        'source', coalesce(v_last_import.source, 'simulated-ga-api'),
        'importedAt', coalesce(v_last_import.imported_at::text, ''),
        'tables', jsonb_build_object(
          'articles', v_article_rows,
          'gaDailyEngagement', v_engagement_rows
        )
      )
    )
  );
end;
$$;
