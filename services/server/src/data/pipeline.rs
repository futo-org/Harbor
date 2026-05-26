//! Generic query pipeline: `fetch → hydrate → filter → view`.

pub async fn create_pipeline<
    Context,
    Params,
    Fetched,
    Hydrated,
    Filtered,
    View,
    Error,
    FetchFn,
    HydrateFn,
    FilterFn,
    ViewFn,
>(
    ctx: &Context,
    params: &Params,
    fetch_fn: FetchFn,
    hydrate_fn: HydrateFn,
    filter_fn: FilterFn,
    view_fn: ViewFn,
) -> Result<View, Error>
where
    FetchFn: AsyncFnOnce(&Context, &Params) -> Result<Fetched, Error>,
    HydrateFn:
        AsyncFnOnce(&Context, &Params, &Fetched) -> Result<Hydrated, Error>,
    FilterFn: AsyncFnOnce(
        &Context,
        &Params,
        Fetched,
        &Hydrated,
    ) -> Result<Filtered, Error>,
    ViewFn: AsyncFnOnce(
        &Context,
        &Params,
        Filtered,
        Hydrated,
    ) -> Result<View, Error>,
{
    let fetched = fetch_fn(ctx, params).await?;
    let hydrated = hydrate_fn(ctx, params, &fetched).await?;
    let filtered = filter_fn(ctx, params, fetched, &hydrated).await?;
    view_fn(ctx, params, filtered, hydrated).await
}
