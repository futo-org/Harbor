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

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    /// Track which stages actually executed. `Cell` keeps the tests
    /// single-threaded but avoids the borrow-checker dance of
    /// `&mut Vec` across await points.
    #[derive(Default)]
    struct Trace {
        fetch_ran: Cell<bool>,
        hydrate_ran: Cell<bool>,
        filter_ran: Cell<bool>,
        view_ran: Cell<bool>,
    }

    #[derive(Default)]
    struct Params {
        seed: u32,
    }

    #[tokio::test]
    async fn happy_path_runs_all_stages_and_threads_state() {
        let trace = Trace::default();
        let params = Params { seed: 7 };

        let result = create_pipeline(
            &trace,
            &params,
            // fetch: produce rows derived from params.seed
            async |ctx: &Trace, p: &Params| -> Result<Vec<u32>, &'static str> {
                ctx.fetch_ran.set(true);
                Ok(vec![p.seed, p.seed + 1, p.seed + 2])
            },
            // hydrate: sum the rows
            async |ctx: &Trace,
                   _p: &Params,
                   rows: &Vec<u32>|
                   -> Result<u32, &'static str> {
                ctx.hydrate_ran.set(true);
                Ok(rows.iter().copied().sum())
            },
            // filter: keep evens
            async |ctx: &Trace,
                   _p: &Params,
                   rows: Vec<u32>,
                   _h: &u32|
                   -> Result<Vec<u32>, &'static str> {
                ctx.filter_ran.set(true);
                Ok(rows.into_iter().filter(|n| n % 2 == 0).collect())
            },
            // view: package into a struct
            async |ctx: &Trace,
                   _p: &Params,
                   filtered: Vec<u32>,
                   hydrated: u32|
                   -> Result<(Vec<u32>, u32), &'static str> {
                ctx.view_ran.set(true);
                Ok((filtered, hydrated))
            },
        )
        .await;

        let (live, sum) = result.unwrap();
        assert_eq!(live, vec![8]);
        assert_eq!(sum, 7 + 8 + 9);
        assert!(trace.fetch_ran.get());
        assert!(trace.hydrate_ran.get());
        assert!(trace.filter_ran.get());
        assert!(trace.view_ran.get());
    }

    #[tokio::test]
    async fn fetch_failure_short_circuits_remaining_stages() {
        let trace = Trace::default();
        let params = Params::default();

        let result: Result<(), &'static str> = create_pipeline(
            &trace,
            &params,
            async |ctx: &Trace,
                   _p: &Params|
                   -> Result<Vec<u32>, &'static str> {
                ctx.fetch_ran.set(true);
                Err("fetch boom")
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _rows: &Vec<u32>|
                   -> Result<u32, &'static str> {
                ctx.hydrate_ran.set(true);
                Ok(0)
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _rows: Vec<u32>,
                   _h: &u32|
                   -> Result<Vec<u32>, &'static str> {
                ctx.filter_ran.set(true);
                Ok(vec![])
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _f: Vec<u32>,
                   _h: u32|
                   -> Result<(), &'static str> {
                ctx.view_ran.set(true);
                Ok(())
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "fetch boom");
        assert!(trace.fetch_ran.get());
        assert!(!trace.hydrate_ran.get());
        assert!(!trace.filter_ran.get());
        assert!(!trace.view_ran.get());
    }

    #[tokio::test]
    async fn hydrate_failure_short_circuits_filter_and_view() {
        let trace = Trace::default();
        let params = Params::default();

        let result: Result<(), &'static str> = create_pipeline(
            &trace,
            &params,
            async |ctx: &Trace,
                   _p: &Params|
                   -> Result<Vec<u32>, &'static str> {
                ctx.fetch_ran.set(true);
                Ok(vec![1, 2, 3])
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _rows: &Vec<u32>|
                   -> Result<u32, &'static str> {
                ctx.hydrate_ran.set(true);
                Err("hydrate boom")
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _rows: Vec<u32>,
                   _h: &u32|
                   -> Result<Vec<u32>, &'static str> {
                ctx.filter_ran.set(true);
                Ok(vec![])
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _f: Vec<u32>,
                   _h: u32|
                   -> Result<(), &'static str> {
                ctx.view_ran.set(true);
                Ok(())
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "hydrate boom");
        assert!(trace.fetch_ran.get());
        assert!(trace.hydrate_ran.get());
        assert!(!trace.filter_ran.get());
        assert!(!trace.view_ran.get());
    }

    #[tokio::test]
    async fn filter_failure_short_circuits_view() {
        let trace = Trace::default();
        let params = Params::default();

        let result: Result<(), &'static str> = create_pipeline(
            &trace,
            &params,
            async |ctx: &Trace,
                   _p: &Params|
                   -> Result<Vec<u32>, &'static str> {
                ctx.fetch_ran.set(true);
                Ok(vec![1])
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _rows: &Vec<u32>|
                   -> Result<u32, &'static str> {
                ctx.hydrate_ran.set(true);
                Ok(42)
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _rows: Vec<u32>,
                   _h: &u32|
                   -> Result<Vec<u32>, &'static str> {
                ctx.filter_ran.set(true);
                Err("filter boom")
            },
            async |ctx: &Trace,
                   _p: &Params,
                   _f: Vec<u32>,
                   _h: u32|
                   -> Result<(), &'static str> {
                ctx.view_ran.set(true);
                Ok(())
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "filter boom");
        assert!(trace.fetch_ran.get());
        assert!(trace.hydrate_ran.get());
        assert!(trace.filter_ran.get());
        assert!(!trace.view_ran.get());
    }

    #[tokio::test]
    async fn view_failure_propagates() {
        let trace = Trace::default();
        let params = Params::default();

        let result: Result<(), &'static str> = create_pipeline(
            &trace,
            &params,
            async |_c: &Trace, _p: &Params| -> Result<Vec<u32>, &'static str> {
                Ok(vec![])
            },
            async |_c: &Trace,
                   _p: &Params,
                   _rows: &Vec<u32>|
                   -> Result<u32, &'static str> { Ok(0) },
            async |_c: &Trace,
                   _p: &Params,
                   _rows: Vec<u32>,
                   _h: &u32|
                   -> Result<Vec<u32>, &'static str> { Ok(vec![]) },
            async |ctx: &Trace,
                   _p: &Params,
                   _f: Vec<u32>,
                   _h: u32|
                   -> Result<(), &'static str> {
                ctx.view_ran.set(true);
                Err("view boom")
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "view boom");
        assert!(trace.view_ran.get());
    }
}
